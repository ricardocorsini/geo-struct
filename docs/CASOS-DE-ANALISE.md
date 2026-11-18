# Casos de análise e formato v5

Um caso prepara as entradas de uma análise na geometria de uma seção. Cada caso tem ID próprio; geometria, materiais, linha piezométrica e dados das faixas continuam no cadastro da seção. Mudar esses dados afeta os casos vinculados. A versão em desenvolvimento permite preparar a [geometria das fatias de um círculo fixo](GEOMETRIA-DO-CIRCULO.md), sem gravá-la no arquivo. Fellenius e Bishop também podem avaliar os círculos da [busca circular](BUSCA-CIRCULAR.md). O perfil numérico aplicado pertence ao caso e é salvo no arquivo. Resultados dos cálculos e prévias ficam na sessão.

## Contrato

`project.analysisCases` admite de zero a 100 casos. IDs são únicos em todo o projeto. Um projeto novo ou migrado não recebe casos automaticamente.

| Campo                     | Conteúdo e regra                                                                                                                   |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `name`, `sectionId` | ID único, nome não vazio até 120 caracteres e referência obrigatória a uma seção existente                                         |
| `description`             | Hipóteses do cenário, até 2.000 caracteres; branco é pendência                                                                     |
| `direction`               | `left-to-right` (+X), `right-to-left` (−X) ou nulo; não inferida pela inclinação do terreno                                        |
| `methods`                 | Lista sem duplicatas de `bishop` e/ou `fellenius`; vazia é pendência. Os dois métodos estão disponíveis para círculo fixo e busca. |
| `surfaceMode`             | `fixed`, `search` ou nulo                                                                                                          |
| `numericalProfile`        | Configurações numéricas de geometria, Fellenius, Bishop e busca; campos numéricos ou nulos enquanto pendentes                      |
| `fixedCircle`             | Centro `x`, `y` (Z) em m e `radius` em m; cada valor pode ser nulo enquanto pendente                                               |
| `search`                  | Eixos `x`, `y` (Z) e `radius`, cada um com `min`, `max` e `step` em m, inicialmente nulos                                          |
| `waterCondition`          | Nulo, `section`, `dry` ou `piezometric`                                                                                            |
| `waterSource`             | Origem/justificativa da hipótese própria de água, até 2.000 caracteres                                                             |
| `loadCondition`           | Nulo, `section`, `none` ou `selected`                                                                                              |
| `loadIds`                 | IDs distintos de até 100 faixas da mesma seção, preservados também quando a seleção estiver inativa                                |

Coordenadas têm o limite de armazenamento existente de ±1.000.000 m; raios devem ser positivos e até 1.000.000 m; passos devem ser positivos e até 2.000.000 m. São limites de cadastro, sem significado de recomendação de engenharia. Campos faltantes permanecem nulos, sem valores presumidos. O referencial original X/Z é preservado ao mudar a direção; A normalização pelo sentido ocorre na entrada mecânica das fatias.

Mínimo não pode exceder máximo no modo de busca ativo. Intervalos não nulos exigem passo informado; um intervalo fixo admite passo nulo. O painel de busca usa os valores aplicados, mostra a contagem de candidatos e usa o grupo de perfil de busca guardado no caso. Consulte as regras de enumeração, capacidade e classificação em [Busca circular](BUSCA-CIRCULAR.md).

O registro de centros, raios e passos explícitos segue o recorte de D5 registrado na [decisão de engenharia da #30](https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6850038580). A [especificação candidata](https://github.com/ricardocorsini/openstruct-front/issues/30#issuecomment-6863167450) mantém R0–R6 e aceite integral pendentes na consulta de 17/11/2026. O cadastro guarda as entradas do caso. O núcleo aplica as regras documentadas do recorte de busca.

## Perfil numérico

`numericalProfile` guarda os grupos abaixo, independentemente do modo de superfície ou dos métodos selecionados.

| Grupo       | Campos                                                                                                                          |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `geometry`  | `toleranceM` e `maxArcDegrees` para a preparação do círculo fixo                                                                |
| `fellenius` | `drivingThresholdKNPerM` e `tensionToleranceKPa`                                                                                |
| `bishop`    | `drivingThresholdKNPerM`, `tensionToleranceKPa`, `initialFactor`, `residualTolerance`, `maxIterations` e `singularityThreshold` |
| `search`    | `geometry`, `equilibrium`, `bishop` e `nearTieTolerance`                                                                        |

Na busca, `geometry` usa os mesmos nomes do grupo geométrico, `equilibrium` guarda os dois limiares comuns dos métodos e `bishop` guarda `initialFactor`, `residualTolerance`, `maxIterations` e `singularityThreshold`. `nearTieTolerance` é a tolerância de quase empate. Cada grupo conserva seus próprios valores ao trocar modo ou método.

Todos os campos aceitam número ou `null`. Nulo indica uma configuração a completar e pode ser salvo. Números preenchidos precisam ser finitos e respeitar os limites do núcleo: tolerância geométrica, F₀ e tolerância de resíduo positivos; abertura angular maior que zero e até 3°; K inteiro de 1 a 1.000; demais limiares e quase empate não negativos. Campos desconhecidos e números inválidos são recusados. A execução exige os campos necessários ao modo e aos métodos ativos.

Um caso novo recebe perfil vazio, com a abertura angular de 3° já usada pela preparação geométrica. Os demais campos começam nulos. O projeto padrão fornece perfis ilustrativos preenchidos, que também são serializados. Ao reabrir um caso, seus parâmetros aplicados voltam aos controles; resultados e prévias precisam ser produzidos novamente pelas ações de cálculo.

Edições válidas do perfil entram no projeto e no histórico. Texto numérico inválido permanece em rascunho, com mensagem e proteção ao trocar de contexto. O arquivo e a recuperação local guardam somente os dados aplicados. Duplicar um caso ou uma seção copia os grupos do perfil com valores independentes; desfazer/refazer restaura o estado aplicado de cada caso.

## Resolução das condições

| Escolha no caso    | Entradas usadas na prévia e conferência                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| Água `section`     | Condição, linha, γw e origem atuais da seção                                                                 |
| Água `dry`         | Hipótese seca e origem informada no caso; linha/γw da seção permanecem guardados                             |
| Água `piezometric` | Linha e γw cadastrados na seção, com origem da hipótese própria do caso; a linha pode estar inativa na seção |
| Água nula          | Não definida, sem pressupor condição seca                                                                    |
| Cargas `section`   | Condição atual da seção e habilitação individual de suas faixas                                              |
| Cargas `none`      | Nenhuma faixa ativa no caso, mantendo os IDs guardados                                                       |
| Cargas `selected`  | Somente as faixas em `loadIds`, independentemente da habilitação ou condição de cargas na seção              |
| Cargas nula        | Não definidas, sem pressupor ausência de carga                                                               |

A resolução cria uma cópia em memória, sem alterar o cadastro. Dados de cada faixa são compartilhados: nome, intervalo, q e origem continuam na seção. Uma seleção explícita vazia é pendência, não é convertida para `none`. A origem própria de água permanece guardada quando se escolhe herdar a condição da seção. Uma hipótese piezométrica exige linha e γw; a seca exige justificativa. A conferência reutiliza os diagnósticos de água/cargas com destino ao caso correspondente.

O modelo ainda contém uma única linha piezométrica e um cadastro de faixas por seção. Linhas alternativas ou intensidades diferentes podem ser representadas em outra seção duplicada; séries temporais, combinações com fatores, variações de material e estágios construtivos não fazem parte deste recorte.

## Edição e integridade

- Criar caso deixa direção, métodos, superfície e condições pendentes; não copia o círculo de tentativa automaticamente.
- Copiar círculo de tentativa preenche o rascunho. Desenhar círculo do caso grava sua geometria em uma operação; a tabela aceita ponto/vírgula decimal.
- Alternar círculo fixo/busca conserva a configuração inativa. A prévia mostra apenas o modo aplicado; não comprova interseções, massa deslizante ou admissibilidade.
- Duplicar caso cria ID próprio e conserva as referências na mesma seção. Configurações são independentes.
- Duplicar seção copia seus casos e remapeia as referências para os novos IDs de faixas, inclusive seleções guardadas. Se exceder o limite de casos, a operação inteira é recusada.
- Excluir caso preserva a seção. Excluir seção informa quantos casos serão excluídos e realiza tudo no mesmo passo de histórico.
- Excluir faixa selecionada por qualquer caso exige retirar antes suas referências, inclusive guardadas/inativas. Casos que herdam a lista da seção acompanham as alterações dessa lista.
- Rascunhos exigem Aplicar caso; trocar contexto protege campos e desenhos em andamento. Desfazer/refazer reverte cada transação completa.

A prévia de caso permite navegar e inspecionar suas entradas; editar a geometria retorna ao cadastro base pela árvore ou pelo comando específico. Selecionar um caso não altera o arquivo. O relatório conserva as hipóteses, direção, métodos, condições resolvidas, faixas ativas e configurações inativas identificadas, sem FS ou status de aprovação.

## Migração

O formato atual é `geostruct/5`. O leitor valida cada arquivo v1 a v4 pelo contrato declarado antes de migrar. Em v4, os casos existentes recebem `numericalProfile` vazio e `version: 5`. A abertura angular recebe os 3° já usados na preparação; os demais parâmetros ficam nulos e aparecem como pendências. Perfis numéricos que existiam apenas na sessão de uma versão anterior precisam ser preenchidos novamente.

Arquivos v3 recebem `analysisCases: []` e `version: 5`, conservando os demais campos, inclusive nulos, zeros, linhas/faixas inativas e círculo de tentativa. Arquivos v1/v2 recebem também os campos de água/cargas descritos em [Água e cargas](AGUA-E-CARGAS.md), sem pressupor hipóteses ausentes.

Não se deduz direção, método ou cenário de um círculo antigo. IDs, materiais e geometria são preservados. Campos desconhecidos, referências inexistentes ou cruzadas entre seções e IDs duplicados são recusados. A recuperação local mantém a mesma chave e usa esse leitor. A abertura comunica a migração e marca o projeto para salvar; Salvar como conserva o original. Versões anteriores do aplicativo não leem v5.
