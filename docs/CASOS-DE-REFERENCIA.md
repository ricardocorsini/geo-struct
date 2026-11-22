# Casos de referência de Fellenius, Bishop e busca circular

O catálogo versionado da [issue #6](https://github.com/ricardocorsini/geo-struct/issues/6) compara os métodos e, nos casos compatíveis com o recorte geométrico atual, a preparação completa com resultados produzidos fora do GeoStruct. A origem dos sete controles G01/A01/Q/C é a [entrega da #31, publicada em 20/11/2026](https://github.com/ricardocorsini/openstruct-front/issues/31#issuecomment-7047662690): as reproduções e a base técnica foram revisadas e aceitas por Gustavo Azocar em 18–19/11. Esse aceite das referências é distinto da revisão independente de engenharia e da validação de um software operacional. H-W05 é um controle adicional novo, sem publicação ou aceite humano anterior; STRAT usa entradas ilustrativas do projeto padrão.

A [#30](https://github.com/ricardocorsini/openstruct-front/issues/30) e a [PR #37](https://github.com/ricardocorsini/openstruct-front/pull/37) continuam sendo a especificação candidata e sua revisão. Esta integração preserva D1–D5 e as decisões posteriores publicadas na #31; não declara integração da PR #37, aceite integral da especificação ou aprovação normativa.

## Dados e reprodução independente

| Dados versionados                                                                      | Reprodutor                                                                               | Origem e alcance                                                                                                                                                                                                                                               |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`openstruct.json`](../tests/fixtures/reference-catalog/openstruct.json)               | [`openstruct_reference.py`](../scripts/references/openstruct_reference.py)               | Sete controles da equipe publicados na #31; cinco secos com preparo completo e dois com água limitados às equações em fatias prescritas, mais diagnóstico do bloqueio geométrico. Terreno relacionado ao Exemplo 7 de Duncan, Wright e Brandon (2014), §7.7.7. |
| [`homogeneous-water.json`](../tests/fixtures/reference-catalog/homogeneous-water.json) | [`openstruct_reference.py`](../scripts/references/openstruct_reference.py)               | H-W05: novo controle próprio de solo homogêneo com pressão positiva, verificado desde a preparação. Não substitui A01/A01-B nem tem aceite anterior da #31.                                                                                                    |
| [`stratified-search.json`](../tests/fixtures/reference-catalog/stratified-search.json) | [`stratified_search_reference.py`](../scripts/references/stratified_search_reference.py) | STRAT: entradas ilustrativas do projeto padrão, com dois materiais efetivos, água e sobrecarga; círculo fixo e 27 candidatos em duas discretizações. Não é benchmark geotécnico publicado.                                                                     |

Os dois scripts usam somente a biblioteca padrão do Python 3.10 ou posterior. Não importam o núcleo, não executam o produto e não usam suas saídas para gerar os valores esperados. As interseções vêm das equações reta–círculo e as áreas de integrais analíticas. As equações são as do recorte documentado em [Fellenius](FELLENIUS-CIRCULO-FIXO.md), [Bishop](BISHOP-CIRCULO-FIXO.md) e [busca circular](BUSCA-CIRCULAR.md), com rastreabilidade ao Duncan e ao USACE EM 1110-2-1902.

A partir da raiz do checkout, conferir os JSON sem regravá-los:

```text
python scripts/references/openstruct_reference.py --check
python scripts/references/stratified_search_reference.py --check
```

Em um ambiente que disponibilize o interpretador como `python3`, substituir apenas o nome do comando. `--check` recalcula e compara os objetos JSON em precisão completa; a formatação textual do arquivo não decide a igualdade. O primeiro comando confere tanto `openstruct.json` quanto `homogeneous-water.json`. Sem `--check`, os scripts regravam seus arquivos padrão. `--output CAMINHO` indica outro arquivo principal, inclusive na conferência; o primeiro script aceita também `--water-output CAMINHO` para H-W05. Alterações de referência exigem revisão das entradas, hipóteses e diferenças antes de substituir o catálogo; uma falha do produto não autoriza ajustar o esperado.

Os JSON são referências estáveis de teste. Relatórios de uma execução, ambiente, SHA, parecer e evidências ficam na discussão da issue, sem serem incorporados ao código como relatórios de ensaio.

## Unidades, discretização e perfis

As entradas e saídas versionadas estão em SI: m, m², kN/m³, kPa, kN/m, kN·m/m e radianos, com campos em graus identificados. As referências originais da #31 usam ft, ft², pcf, psf e lb para uma faixa de **1 ft fora do plano**. A conversão usa `ft = 0,3048 m` e `lbf = 0,0044482216152605 kN`: força por largura é multiplicada por `lbf/ft`, pressão por `lbf/ft²` e peso específico por `lbf/ft³`. Converter a força somente por lbf produziria grandezas incompatíveis.

A geometria usa o arco inferior, área até o arco analítico, base resistente pela corda e pressão/material no ponto médio angular. O peso entra com braço aproximado `R sen α`; cada sobrecarga mantém o centro do trecho horizontal carregado e seu próprio braço. Os cortes obrigatórios incluem encontros e vértices do terreno, cruzamentos arco–interface, nós/cruzamentos da água ativa e bordas de faixas ativas. Vértices de um polígono também podem subdividir a integração interna das subáreas sem criar outra fatia pública.

Nos sete controles, o reprodutor conserva o arredondamento histórico das abscissas obrigatórias a 12 casas em ft. Essa convenção de reprodução não é uma regra topológica geral do produto. A geometria usa tolerância explícita de `10⁻⁸ m` e subdivide cada intervalo obrigatório em ângulos iguais, com abertura máxima de 3°. STRAT também é recalculado com abertura máxima de 1,5°, preservando círculos e cortes obrigatórios.

| Perfil de Bishop            | F inicial | Resíduo absoluto `abs(G(F) − F)` | Máximo de avaliações |
| --------------------------- | --------: | -------------------------------: | -------------------: |
| P0, preservado              |       1,4 |                             10⁻⁶ |                   20 |
| P1, referência mais estrita |       1,4 |                             10⁻⁸ |                   20 |

Bishop devolve o **F avaliado** que satisfez seu próprio resíduo, com G(F), histórico e contagem. Resíduo não é um limite universal do erro de FS. Os sete controles e H-W05 conservam P0 e P1 separadamente; STRAT usa P1. A triagem estrita destes dados usa `τD = τm = τt = 0`, exigindo denominador positivo, m positivo e ausência de tração. São escolhas destes controles, **não defaults universais do solver**. A proteção de representação contra cancelamento do denominador continua independente desses limiares.

### Tolerâncias da comparação com o produto

Para entradas, formulação, discretização e perfil idênticos, a regressão usa diferenças absolutas:

| Grandeza                   | Diferença máxima |
| -------------------------- | ---------------: |
| Comprimento/coordenada     |           10⁻⁹ m |
| Área                       |          10⁻⁸ m² |
| Força por largura          |        10⁻⁷ kN/m |
| Tensão/pressão             |         10⁻⁸ kPa |
| Momento por largura        |      10⁻⁶ kN·m/m |
| Ângulo                     |        10⁻¹⁰ rad |
| Coeficiente m adimensional |            10⁻¹⁰ |
| FS, F ou G comparados      |             10⁻⁹ |

As margens dos intermediários acomodam ordenações de operações e cancelamentos em aritmética binary64 nestes dados, com coordenadas da ordem de 80 m e parcelas/somas de força da ordem de 3×10⁴ kN/m. Não exprimem incerteza dos solos, precisão física das fontes, tolerância topológica ou critério normativo. Não se aplica a tolerância adimensional de FS indiscriminadamente às outras unidades. Estados, identidade/ordem dos círculos, quantidade de fatias e número de avaliações são exatos; o resíduo também precisa satisfazer o perfil correspondente.

O critério entre implementações não exige que uma malha de 3° e outra de 1,5° produzam o mesmo FS. Cada uma tem seu próprio esperado. O padrão de exibição é três casas decimais, conservando precisão interna para cálculo, comparação e classificação.

## Sete controles G01/A01/Q/C

O terreno original em ft é `(0,0), (120,48), (135,48), (255,0)`. O círculo A tem centro `(230,110)` e R = 100 ft; B tem centro `(225,110)` e o mesmo raio. O solo homogêneo usa γ = 100 pcf, c′ = 100 psf e φ′ = 30°; a água usa γw = 62,4 pcf. Esse γ é a escolha dos controles geométricos, distinta dos 125 pcf das tabelas manuais do livro. Não se afirma reproduzir a superfície crítica publicada. A linha completa de água, entradas SI e intermediários constam do JSON.

O domínio cadastral aplicado estende a base horizontal de 0 para −1 ft (−0,3048 m), mantendo a elevação original registrada na proveniência. O cadastro exige a base estritamente abaixo de todos os vértices do terreno; a extensão não intercepta nenhuma massa analisada, cujo arco fica acima de 3 m, e não altera áreas, forças ou resultados esperados. Nas duas referências com água, a linha original fica acima do terreno em uma região a montante fora dessas massas a jusante. O aviso do cadastro é preservado. Mesmo sem erro cadastral impeditivo, A01/A01-B encontram o bloqueio geométrico descrito abaixo; os avisos não são apagados para produzir entradas artificialmente sem pendências.

Os resultados abaixo resumem os esperados do oráculo; os testes usam os números completos do arquivo. O catálogo original conserva **sete casos e 127 fatias**: os cinco secos somam 79 fatias verificadas pelo preparo completo; A01/A01-B somam 48 fatias prescritas verificadas somente na camada de equações. Sucesso numérico nessa segunda camada não significa que o GeoStruct preparou suas geometrias.

| Caso      | Condição                       | Fatias | Fellenius | Bishop P0 | Bishop P1 | Avaliações P0/P1 |
| --------- | ------------------------------ | -----: | --------: | --------: | --------: | ---------------: |
| G01       | A, seco                        |     15 |     2,094 |     2,141 |     2,141 |            7 / 9 |
| A01       | A, linha piezométrica          |     23 |     1,516 |    1,483¹ |    1,483¹ |           7 / 10 |
| Q-total   | A, q = 100 psf em [185,205] ft |     16 |     2,065 |     2,110 |     2,110 |            7 / 9 |
| Q-parcial | A, q = 100 psf em [150,170] ft |     16 |     2,032 |     2,084 |     2,084 |            7 / 9 |
| Q-fora    | A, q = 100 psf em [135,150] ft |     15 |     2,094 |     2,141 |     2,141 |            7 / 9 |
| C-B       | B, seco                        |     17 |     1,991 |     2,053 |     2,053 |            7 / 9 |
| A01-B     | B, linha piezométrica          |     25 |     1,415 |     1,395 |     1,395 |            6 / 8 |

¹ Ao receber as fatias prescritas independentemente, Bishop converge algebricamente no A01, mas apresenta tração na primeira base. Os números são **tentativas diagnósticas, sem FS elegível**: nessa camada de equações, o estado é `rejected` e `factorOfSafety` é `null`. A pressão prescrita nessa primeira base é zero; não se atribui a tração a uma pressão positiva nela. Com as mesmas fatias prescritas, Fellenius fornece seu resultado admissível. Apertar P0 para P1 não remove a tração. Esses resultados não são uma execução integrada desde a geometria.

### Limite geométrico de A01 e A01-B

O último segmento da linha piezométrica é colinear com o terreno na saída. As raízes calculadas separadamente chegam ao mesmo evento físico com abscissas binary64 diferentes: em A01, cerca de `70,104` e `70,10400000000001 m`; em A01-B, `70,01902801559363` e `70,01902801559365 m`. A separação é aproximadamente `1,42×10⁻¹⁴ m`. O oráculo histórico arredonda os cortes obrigatórios a 12 casas em ft e os representa como um corte; o preparador do produto conserva as duas chaves distintas e devolve **`blocked` / `cuts-too-close`**, sem geometria ou fatias preparadas.

Os testes preservam as entradas e resultados publicados, verificam explicitamente esse bloqueio e, em outro ensaio, fornecem as 23/25 fatias do oráculo ao adaptador de entrada mecânica para testar Fellenius/Bishop. Não alteram o motor, a política R3, a tolerância geométrica ou os esperados para fazer a preparação passar. Resolver a identificação desse evento coincidente exige revisão própria do contrato geométrico. Até lá, A01/A01-B não são evidência positiva de preparação com água.

Nos cinco casos secos, a cobertura completa compara interseções, cortes/fatias, áreas, W, resultantes e momentos próprios das faixas, parcelas resistentes/motrizes e a trajetória de Bishop. Casos específicos existentes distinguem condição seca com linha preservada, faixa desabilitada e faixa ativa com q zero: q zero pode criar cortes mesmo sem força. Não se exige igualdade de FS entre malhas diferentes por ativação de um corte.

## H-W05: controle adicional homogêneo com água

H-W05 conserva o terreno, solo efetivo e círculo A de G01, sem sobrecarga. Sua linha piezométrica tem os quatro nós do terreno deslocados verticalmente em −5 ft (−1,524 m). É um **novo caso próprio da #6**, com `publication` e `provenance.sourceUrl` nulos, sem publicação ou aceite humano anteriores. O vínculo à #31 identifica a base de G01, sem atribuir à fonte o novo caso. Sua revisão humana de engenharia continua pendente na #44.

O caso é verificado pelo preparo completo, com 15 fatias, pressão máxima de aproximadamente 8,076714 kPa e separação mínima entre cortes obrigatórios de cerca de 3,684 m. Ambos os métodos mantêm contato compressivo; a menor tensão de Bishop P1 é aproximadamente 1,990069 kPa.

| Fellenius | Bishop P0 | Avaliações P0 | Bishop P1 | Avaliações P1 |
| --------: | --------: | ------------: | --------: | ------------: |
|     1,896 |     1,911 |             7 |     1,911 |             9 |

H-W05 fornece cobertura integrada homogênea com pressão positiva enquanto o limite dos cortes de A01/A01-B permanece exposto. Não corrige nem substitui as duas referências originais. Assim como STRAT, é regressão controlada, sem homologação de engenharia ou garantia para outras linhas de água.

## STRAT: estratos, água, carga e busca

STRAT usa o terreno SI `(0,22), (18,22), (38,10), (60,10)`, solo residual γ = 19 kN/m³ e φ′ = 28°, aterro γ = 18 kN/m³ e φ′ = 30°, ambos com c′ = 0. O polígono completo do aterro está no JSON. A linha piezométrica passa por `(0,12), (18,12), (38,7), (60,7)`, com γw = 9,81 kN/m³; a faixa de crista aplica 20 kPa entre X = 5 e 14 m. O peso é a soma de γ por subárea, incluindo materiais acima da base; a resistência usa o material que contém a base.

| Superfície                               | Abertura máxima | Fatias | Fellenius | Bishop P1 |
| ---------------------------------------- | --------------: | -----: | --------: | --------: |
| Fixa: centro (32,32) m, R = 25 m         |              3° |     35 |     1,283 |     1,474 |
| Mesma fixa, refinada                     |            1,5° |     66 |     1,283 |     1,474 |
| Mínimo amostrado: candidato 25           |              3° |     22 |     1,179 |     1,272 |
| Mínimo amostrado: candidato 25, refinado |            1,5° |     43 |     1,179 |     1,271 |

A busca enumera X e Z em `[30,32,34]` m e R em `[23,25,27]` m: 27 círculos em cada abertura. O raio varia primeiro, depois Z e X. Todos os 27 têm geometria preparada e resultados admissíveis de ambos os métodos nas duas discretizações; os esperados preservam cada candidato, seus estados e avaliações. O círculo fixo é o candidato 14.

O candidato 25, centro `(34,34)` m e R = 23 m, permanece mínimo de ambos os métodos e está na borda dos três eixos. Não há empate exato nem quase empate até 10⁻⁶. Trata-se do **mínimo do conjunto amostrado**, sem prova de mínimo global ou domínio suficiente. A mudança de abertura leva Bishop de 1,272 para 1,271 na exibição com três casas: a apresentação pode mudar mesmo com uma diferença pequena e a identidade do mínimo preservada.

O reprodutor STRAT é especializado no aterro acima de uma interface inferior conhecida. Não é um segundo preparador genérico de polígonos ou prova para estratificações arbitrárias.

## Matriz de alcance R0–R6 e pendências

Esta matriz relaciona a regressão aos itens da base técnica publicada. Os testes de fronteira já existentes complementam o catálogo; não se presume aceite integral desses itens pela concordância numérica.

| Item                              | Alcance verificado                                                                                                                                                     | Limite preservado                                                                                                                                                   |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R0 — sinais e momentos            | Sobrecargas total/parcial/fora, braço próprio, termos com sinal; controles analíticos e de espelhamento existentes.                                                    | Braço do peso continua a aproximação `R sen α`; não é integração do centroide real de toda fatia.                                                                   |
| R1 — arco, corda e amostragem     | Preparo completo dos cinco secos, H-W05 e STRAT; A01/A01-B verificam o bloqueio, com equações em fatias prescritas separadamente.                                      | A01/A01-B não preparam geometria; faces verticais na massa são recusadas. Não se valida geometria arbitrária.                                                       |
| R2 — materiais e água             | H-W05 com pressão positiva e STRAT efetivo com duas subáreas percorrem o preparo completo; a camada prescrita de A01/A01-B conserva as equações.                       | A01/A01-B não provam preparo com água. Mistura efetivo/total, água externa e carga acima do terreno na massa permanecem fora do recorte admissível.                 |
| R3 — discretização e malha        | Cortes obrigatórios, bloqueio `cuts-too-close` dos dois casos publicados, refinamento 3°/1,5°, enumeração dos 27 círculos, identidades e contagens.                    | A política geométrica não foi alterada; identificação do evento coincidente de A01/A01-B e valores gerais de topologia/largura exigem revisão própria.              |
| R4 — iteração e admissibilidade   | P0/P1, F avaliado, G/resíduo/contagem, normais no F convergido e rejeição de A01 nas fatias prescritas; testes existentes de singularidade, tração e não convergência. | τD/τm/τt nulos valem para estas referências. A rejeição por tração não é alcançada pelo fluxo integrado bloqueado na geometria; valores gerais continuam pendentes. |
| R5 — resistência nula             | Testes específicos existentes distinguem ausência física de resistência, cancelamento e D inválido; Fellenius FS zero e Bishop estado sem FS.                          | Os novos casos positivos não homologam todo o tratamento de contato do ramo nulo da especificação candidata.                                                        |
| R6 — classificação e apresentação | Mínimo em precisão completa, ordem/empates nos testes específicos, candidato 25 na borda, estados e comparação por método.                                             | Somente mínimo amostrado; três casas são apresentação, sem critério normativo de estabilidade.                                                                      |

O G-02 da #31 mistura areia efetiva e argila total. A sua referência documental é preservada na fonte, mas não entra como benchmark positivo deste motor: ambos os métodos recusam bases mistas com `mixed-modes`. Aceitar numericamente esse caso exige outra decisão e ampliação explícita do recorte.

As transcrições de nove fatias da fig. 7.34 e dez da fig. 7.40 de Duncan continuam verificando equações nas fatias fornecidas. Os cinco controles secos, H-W05 e STRAT acrescentam a reconstrução geométrica e preparações; STRAT acrescenta a busca independente. A01/A01-B permanecem limitados ao diagnóstico geométrico e às equações em fatias prescritas. Nenhuma dessas verificações transforma as transcrições do livro em reprodução integral da geometria publicada.

A revisão por outra pessoa da engenharia permanece pendente na [openstruct-front #44](https://github.com/ricardocorsini/openstruct-front/issues/44). Os cenários geométricos adicionais continuam na [#45](https://github.com/ricardocorsini/openstruct-front/issues/45). Revisão de IA, aceite das referências por seu preparador e testes automatizados não substituem o parecer humano independente. O aceite integral da #30/PR #37 e a homologação manual nativa Windows/WebView2 e Linux/WebKitGTK também permanecem separados desta regressão.
