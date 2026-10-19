import { describe, expect, it } from 'vitest';
import { checkKey, classifyDependency, collisions, emptyProgress, initializeProgress, loadProgress, mastery, mistakeIds, recordAttempt, STORAGE_KEY } from './domain';
import { enrollmentRows, lecturerRows, lessons, normalCases, orderRows, studentRows } from './content';
import { exercises } from './exercises';
import { validateWorkshop } from './workshop-domain';

describe('key uniqueness and minimality', () => {
  it('detects the actual lecturer collision rather than assuming a pair is a key', () => {
    expect(collisions(lecturerRows, ['Lecturer_no', 'Course_code'])).toEqual([[5, 6]]);
    expect(checkKey(lecturerRows, ['Lecturer_no', 'Course_code']).correct).toBe(false);
    expect(checkKey(lecturerRows, ['Lecturer_no', 'Course_code', 'Start_date'], [['Lecturer_no', 'Course_code', 'Start_date']]).correct).toBe(true);
  });
  it('uses declared rules rather than accidental uniqueness of dates', () => expect(checkKey(lecturerRows, ['Start_date'], [['Lecturer_no', 'Course_code', 'Start_date']]).correct).toBe(false));
  it('detects a nonminimal superkey under the rules', () => expect(checkKey(studentRows, ['student_id', 'first_name'], [['student_id'], ['email']]).message).toContain('não mínima'));
  it('detects minimality without supplied business keys', () => {
    expect(checkKey(enrollmentRows, ['student_id', 'course_id']).correct).toBe(true);
    expect(checkKey(enrollmentRows, ['student_id', 'course_id', 'grade']).correct).toBe(false);
  });
  it('rejects NULL and empty proposals', () => {
    expect(checkKey([{ id: null }, { id: 2 }], ['id']).correct).toBe(false);
    expect(checkKey(studentRows, []).correct).toBe(false);
  });
  it('does not combine values in ambiguous strings', () => expect(collisions([{ a: 'a,b', b: 'c' }, { a: 'a', b: 'b,c' }], ['a', 'b'])).toEqual([]));
  it('allows candidate and alternate simple keys', () => {
    expect(checkKey(studentRows, ['student_id'], [['student_id'], ['email']]).correct).toBe(true);
    expect(checkKey(studentRows, ['email'], [['student_id'], ['email']]).correct).toBe(true);
  });
});

describe('normalisation and exact teaching examples', () => {
  it('classifies whole, partial and transitive dependencies', () => {
    expect(classifyDependency(['StudentID', 'CourseID'], { determinant: ['StudentID'], dependent: 'StudentName' })).toBe('partial');
    expect(classifyDependency(['StudentID', 'CourseID'], { determinant: ['StudentID', 'CourseID'], dependent: 'Grade' })).toBe('full');
    expect(classifyDependency(['OrderID'], { determinant: ['OrderID'], dependent: 'CustomerName', via: 'CustomerID' })).toBe('transitive');
  });
  it('keeps lecturer 2NF identical to 3NF under the given assumptions', () => {
    const c = normalCases[0]; expect(c.rows).toHaveLength(8); expect(c.second).toBe(c.third);
    expect(c.third[2].pk).toEqual(['Lecturer_no', 'Course_code', 'Start_date']);
  });
  it('keeps leading zeros and the exact hardware line items', () => {
    expect(orderRows).toHaveLength(5); expect(orderRows[0].CustomerNumber).toBe('0123'); expect(orderRows[2].CustomerNumber).toBe('0345');
    expect(normalCases[1].second[0].columns).toContain('Name'); expect(normalCases[1].third.find(t => t.name === 'ORDERS')?.columns).not.toContain('Name');
  });
  it('does not invent additional library columns', () => {
    expect(Object.keys(normalCases[2].rows[0])).toHaveLength(6);
    expect(normalCases[2].third.map(t => t.name)).toEqual(['MEMBERS', 'CATEGORIES', 'BOOKS', 'MEMBER_BOOKS']);
  });
  for (const c of normalCases) for (const stage of [2, 3] as const) {
    it(`validates the ${stage}NF workshop for ${c.id}`, () => {
      const tables = stage === 2 ? c.second : c.third; const reason = stage === 2 ? c.reason2 : c.reason3;
      expect(validateWorkshop(structuredClone(tables), tables, reason, stage, c.second === c.third).correct).toBe(true);
    });
  }
  it('rejects wrong columns, keys, references and missing rationale', () => {
    const c = normalCases[0]; const draft = structuredClone(c.second);
    draft[2].pk.pop(); expect(validateWorkshop(draft, c.second, c.reason2, 2, true).correct).toBe(false);
    const badFk = structuredClone(c.second); badFk[2].fk.Lecturer_no = 'COURSE.Course_code'; expect(validateWorkshop(badFk, c.second, c.reason2, 2, true).correct).toBe(false);
    const badColumn = structuredClone(c.second); badColumn[0].columns.push('Course_name'); expect(validateWorkshop(badColumn, c.second, c.reason2, 2, true).correct).toBe(false);
    expect(validateWorkshop(structuredClone(c.second), c.second, '', 2, true).correct).toBe(false);
  });
});

describe('local progress', () => {
  it('stores attempts, errors and later mastery independently', () => {
    const fail = recordAttempt(emptyProgress(), 'k03', false, 'Lecturer_no, Course_code');
    expect(mistakeIds(fail)).toEqual(['k03']); expect(mastery(fail, ['k03'])).toBe(0);
    const pass = recordAttempt(fail, 'k03', true, 'Lecturer_no, Course_code, Start_date');
    expect(mistakeIds(pass)).toEqual([]); expect(pass.attempts.k03.count).toBe(2); expect(pass.attempts.k03.failures).toBe(1); expect(mastery(pass, ['k03'])).toBe(100);
  });
  it('round trips completion, bookmarks, resume location and answers', () => {
    const p = recordAttempt({ ...emptyProgress(), completed: ['primary'], bookmarks: ['third-normal'], lastPage: 'keys', lastLesson: 'k03' }, 'k03', false, 'A');
    expect(loadProgress({ getItem: key => key === STORAGE_KEY ? JSON.stringify(p) : null })).toEqual(p);
  });
  it('survives corrupt/unavailable storage and incompatible versions', () => {
    expect(loadProgress({ getItem: () => '{bad' })).toEqual(emptyProgress());
    expect(loadProgress({ getItem: () => { throw Error('blocked'); } })).toEqual(emptyProgress());
    expect(loadProgress({ getItem: () => '{"version":2}' })).toEqual(emptyProgress());
  });
  it('survives a SecurityError when the browser localStorage getter is blocked', () => {
    const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
    try {
      Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('Storage access denied'); } });
      expect(loadProgress()).toEqual(emptyProgress());
    } finally {
      if (previous) Object.defineProperty(globalThis, 'localStorage', previous);
      else Reflect.deleteProperty(globalThis, 'localStorage');
    }
  });
  it('ignores malformed individual attempts', () => expect(loadProgress({ getItem: () => JSON.stringify({ ...emptyProgress(), attempts: { x: { count: 'oops' } } }) }).attempts).toEqual({}));
  it('distinguishes temporarily blocked reads from readable but invalid stored data', () => {
    expect(initializeProgress({ getItem() { throw Error('Read denied'); } })).toEqual({ progress: emptyProgress(), storageReadable: false });
    expect(initializeProgress({ getItem: () => '{invalid' })).toEqual({ progress: emptyProgress(), storageReadable: true });
    const saved = recordAttempt(emptyProgress(), 'k03', true, 'Lecturer_no, Course_code, Start_date');
    expect(initializeProgress({ getItem: () => JSON.stringify(saved) })).toEqual({ progress: saved, storageReadable: true });
  });
});

describe('curriculum coverage', () => {
  it('contains curated activities across all required topics', () => {
    expect(new Set(exercises.map(e => e.id)).size).toBe(exercises.length);
    expect(exercises.length).toBeGreaterThanOrEqual(35);
    expect(exercises.filter(e => e.topic === 'keys').length).toBeGreaterThanOrEqual(12);
    expect(exercises.filter(e => e.type === 'sql').length).toBeGreaterThanOrEqual(18);
    expect(exercises.filter(e => e.type !== 'choice').length).toBeGreaterThan(exercises.length / 2);
    for (const e of exercises) {
      expect(lessons.some(l => l.id === e.lesson && l.topic === e.topic)).toBe(true);
      expect(e.hints).toHaveLength(2);
      expect(e.prompt.length).toBeGreaterThan(20);
    }
  });
});
