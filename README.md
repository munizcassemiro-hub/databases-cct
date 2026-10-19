# Database Lab — Reading Week

Aplicação estática para aprender fundamentos de bases de dados fazendo exercícios. React + TypeScript + Vite, com explicações em português brasileiro, vocabulário e questões em inglês e tradução opcional. Não precisa de backend, conta ou credenciais. Material independente, sem afiliação institucional.

## Estudar

Todos os módulos ficam disponíveis imediatamente: Início, Aprender, Keys Lab, Normalisation Lab, SQL Lab, Constraints, Meus Erros e Revisão Rápida. O app tem 17 lições e 63 atividades: 5 de fundamentos, 12 de chaves, 12 de normalização, 24 SQL e 10 de constraints. Há dicas progressivas, resolução sob demanda, favoritos, retomada, revisão de erros e variações de dados e comandos. Não há simulado nem cronômetro.

- **Key Detective:** seleção de colunas, colisões reais, NULL, unicidade e minimalidade segundo as regras declaradas. A amostra docente detecta a colisão `(6455, BM01)`; a chave indicada inclui `Start_date`.
- **Normalisation:** exemplos fornecidos de docentes, pedidos de hardware e biblioteca, com dados e estágios separados. Workshop permite nomear tabelas, atribuir colunas, marcar PK/FK, desfazer e justificar em inglês. No exemplo docente, 2NF já é 3NF sob as dependências informadas. IDs de clientes preservam zeros iniciais. Há prática original de funcionários/projetos, estudantes/cursos e compras/produtos.
- **SQL:** completar/reordenar como aquecimento e 24 exercícios para digitar ou reparar comandos. Parser local compara a estrutura completa solicitada, incluindo tipos, valores, constraints e condições. A variante `enrollment_id` fica separada da variante de PK composta.
- **Constraints:** cenários com tabelas, comandos e regras, cobrindo PK, FK, NOT NULL, UNIQUE, CHECK, DEFAULT, tipos, CASCADE e RESTRICT.
- **Progresso:** `localStorage`, somente neste navegador. Reset exige confirmação. Nenhum dado é enviado a um servidor. As fontes também são servidas pelo próprio app.

A avaliação real descrita no material é closed-book; o app é para preparação anterior. O SQL é escrito, como em Moodle.

## Desenvolvimento

Use Node 24 (ou uma versão compatível >=22.12) e o checkout existente.

```sh
npm ci
npm start
```

```sh
npm test          # regras de chaves, normalização, SQL e persistência
npm run lint
npm run build    # TypeScript e build estático
```

Para os testes de interação, mantenha o servidor de desenvolvimento ativo e use o Chromium instalado no ambiente:

```sh
npm run test:browser
```

O runner usa `/usr/bin/chromium`; `CHROMIUM_PATH` permite outro executável e `BASE_URL` permite outro servidor. Exercita colisões, feedback SQL, variações, montagem de tabelas, progresso após refresh, favoritos, glossário, reset e todos os módulos em tela de 390px. Capturas ficam em `test-results/`, ignorado pelo Git.

```sh
npm run test:curriculum
```

Essa verificação adicional abre todas as 17 lições e resolve os 63 exercícios pela interface, incluindo cada editor SQL e cada workshop. Também testa as 24 variações SQL da fila de erros, a persistência de 100% do progresso e os casos de armazenamento bloqueado/corrompido. O carregador de dados do teste usa cache separado para não invalidar as dependências do servidor de desenvolvimento.

## Preview e inicialização

`npm start` e `npm run dev` iniciam o Vite em `0.0.0.0:5173`. A variável `PORT` permite a porta exigida pelo serviço de preview; a porta é estrita para evitar iniciar silenciosamente em outra porta. `npm run preview` serve o build de produção em `0.0.0.0:4173` (ou `PORT`, quando definida). Os dois servidores aceitam os hostnames dinâmicos usados pelo proxy de preview na nuvem. A produção Netlify usa somente os arquivos de `dist/`.

Depois de atualizar dependências com `npm ci`, reinicie o servidor deste projeto. Se o navegador mantiver um erro `Outdated Optimize Dep`, inicie uma vez com `npm start -- --force` para reconstruir o cache do Vite. Esse procedimento não apaga conteúdo nem progresso do navegador.

Se um iframe/preview bloquear o acesso a `localStorage`, o app continua funcionando com progresso em memória e mostra um aviso. Dados salvos antes de um bloqueio de leitura não são sobrescritos. Quando o armazenamento está disponível, conclusão, erros, favoritos e retomada continuam persistindo normalmente.

## Publicação estática

O `netlify.toml` usa Node 24, executa `npm run build` e publica `dist/`. `public/_redirects` e `public/_headers` são copiados para `dist/`, com fallback para o SPA, HTML sem cache permanente e assets versionados com cache imutável. Isso funciona tanto em builds conectados ao Git quanto em upload direto do conteúdo de `dist/`. Navegação por hash também permite abrir diretamente um módulo/atividade.

O site existente é https://databases-cct.netlify.app. A integração Git do Netlify deve usar `munizcassemiro-hub/databases-cct`, branch de produção `main`, diretório base `.` (raiz do repositório), build command `npm run build` e publish directory `dist`. Essas opções de build estão definidas em `netlify.toml`; as dependências de desenvolvimento necessárias ao Vite/TypeScript são incluídas na instalação.

Com a integração GitHub já conectada ao site e os builds ativados, cada push em `main` inicia o deploy automático. Esse fluxo não exige token Netlify neste projeto nem neste ambiente. A aplicação não exige variáveis de ambiente ou segredos de runtime. Um token de API só seria necessário para administrar ou publicar diretamente no Netlify pela CLI/API; nunca o coloque no código ou em variáveis com prefixo `VITE_`.

## Limites intencionais

O editor faz **validação educacional de estrutura SQL — não executa no MySQL**. Suporta os comandos simples pedidos, não é um parser geral de toda a linguagem. Aceita caixa/espaçamento/ponto e vírgula opcionais, identificadores entre crases, definição de PK inline ou de tabela e reordenação das definições CREATE e pares de INSERT. Nem toda reformulação SQL semanticamente equivalente está no escopo do corretor. SELECTs suportados usam uma prévia determinística das amostras locais; os outros comandos explicam o efeito sem modificar dados.

As justificativas livres são conferidas por critérios explícitos; a resolução deve ser usada para comparar o raciocínio e a redação. O app não avalia toda a semântica da língua inglesa. O workshop usa os nomes de tabela solicitados para conferir as referências. Unicidade de uma amostra não prova uma chave: as regras declaradas também são consideradas.
