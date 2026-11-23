# Escopo e evolução

## 0.1.0 — Modelagem

Esta entrega prepara projetos e seções, materiais, terreno, regiões de solo, água, faixas de carga e círculo de tentativa. Inclui edição por desenho/coordenadas, histórico, persistência e relatório de entradas. Não calcula fator de segurança e não dimensiona contenções.

Limites de modelagem: 100 seções e 100 materiais por projeto; 64 regiões e 100 cargas por seção; 500 pontos por contorno; arquivos até 8 MB. Coordenadas limitadas a ±1.000.000 m. O terreno admite faces verticais com X não decrescente e mantém base horizontal. Não há contorno externo arbitrário, importação DXF/DWG, estágios construtivos, perfis em balanço, cálculo de fluxo, água externa ou análise sísmica. Cada caso tem identidade própria e é vinculado a uma seção; até 100 casos por projeto. O caso compartilha geometria e materiais com a seção, mas registra suas hipóteses, condições de água/cargas e superfície.

### Geometria e edição — implementado

Inserir/excluir/mover vértices, mover contornos, copiar regiões e dividir uma região em duas por uma reta. Interfaces coincidentes acompanham a edição, com opção explícita de desvincular. Captura por vértices/interseções/segmentos, grade configurável, restrição horizontal/vertical, entrada absoluta/relativa/polar e medição. Faces verticais são aceitas na modelagem; seu tratamento físico depende do contrato futuro do motor. Divisões que gerariam ilhas, furos ou mais de duas partes são recusadas. Não há importação CAD nesta entrega.

### Importação de coordenadas CSV — primeiro incremento da #9

Importação do contorno completo do terreno ou de uma região existente, com cabeçalho, colunas X/Z e unidade m/cm/mm explícitos, prévia convertida em metros e confirmação em uma operação de histórico. Aceita UTF-8 com BOM opcional, campos entre aspas, separador `;`, vírgula ou tabulação e decimal escolhido, sem ambiguidade entre os separadores. Limites: 1 MiB e 500 pontos. A mesma validação da edição recusa contorno inválido, saída do domínio e sobreposição; erro ou cancelamento conserva o projeto. Não cria materiais, água, cargas ou casos e não infere vínculos geométricos. Mantém o formato atual `geostruct/5`, os perfis numéricos dos casos e o solver. DXF/DWG e as demais etapas da issue #9 continuam pendentes; este incremento não conclui a issue inteira.

### Materiais e atribuição — implementado

Cadastro Mohr–Coulomb com escolha explícita de parâmetros efetivos/totais, mensagens de limites e pendências por campo. Novas regiões e solos de fundo ficam sem atribuição até a escolha do usuário. Gerenciador com consulta de uso, duplicação e substituição ao excluir; atribuição em lote na seção ativa e histórico por operação. Introduzido no formato `geostruct/2`, preservado no formato atual v4. O peso específico permanece como um único valor total informado; nenhum parâmetro é deduzido de outro ou gerado a partir da água. O detalhamento está em [Materiais e formato](MATERIAIS-E-FORMATO.md).

### Água e sobrecargas — implementado no recorte inicial

Condição de água explícita (não definida, seca ou piezométrica), peso específico informado e origem da hipótese. Sobrecargas uniformes com intensidade nula distinta de zero, origem, habilitação individual, duplicação desabilitada, exclusão e condição global por seção. Desativar preserva os lançamentos. Conferência de cobertura, linha acima do terreno, faixas fora do perfil e sobreposição entre cargas ativas. Formato `geostruct/3` com migração de v1/v2. Ver [Água e cargas](AGUA-E-CARGAS.md). Não há fluxo, água externa, força concentrada, carga trapezoidal, sismo ou cálculo de pressões/esforços nesta etapa.

### Casos de análise — implementado

Cadastro, duplicação e exclusão de casos por seção, com hipóteses, sentido de deslizamento e escolha dos métodos pretendidos. Condições próprias de água e seleção de faixas, além de herança explícita das condições atuais da seção. Círculo fixo por desenho/coordenadas ou cópia explícita do círculo de tentativa. Limites e passos informados para centros X/Z e raios, preservados ao alternar o modo. Prévia de entradas, conferência, relatório e formato `geostruct/4`, com leitura de v1/v2/v3. A geometria e os materiais são compartilhados, e a edição das faixas afeta os casos que as usam. A classificação e os cálculos consomem o caso aplicado. Ver [Casos de análise](CASOS-DE-ANALISE.md).

## 0.2.0 — Análise circular de taludes

A versão desktop reúne a preparação das fatias, Fellenius e Bishop Simplificado, busca circular e um projeto padrão de demonstração. O Launcher oferece os instaladores Windows e Linux pelo catálogo assinado. Consulte as [notas da versão](../.github/release-notes/v0.2.0.md).

## Base técnica

### Preparação geométrica do círculo fixo — implementada

Arco inferior, interseções transversais com o terreno, faces verticais com cotas unilaterais, cortes de terreno/interfaces/água/faixas e refinamento angular de até 3°. Tolerância geométrica explícita, áreas até o arco, comprimentos de arco/corda e identificação geométrica do material na base. Desenho e tabela, com ocultação de prévias desatualizadas. Diagnósticos para contatos, domínio truncado, ambiguidade, cortes estreitos e capacidade. O [contrato geométrico](GEOMETRIA-DO-CIRCULO.md) consolida o recorte de R1/R3 desta entrega; não representa o aceite integral da #30. Sem pesos, pressões, FS ou busca.

### Entradas do núcleo — implementado

Contrato `geostruct-input/1`, adaptador de casos, cópia imutável, origem dos dados, unidades explícitas e revisão determinística das entradas efetivas. Conferência no inspetor do caso, atualizada após aplicar alterações e desfazer/refazer. Preserva nulos, zeros, referências, escolhas próprias/herdadas e coordenadas originais. O arquivo permanece v4. Sem normalização pelo sentido, perfil numérico, fatias ou equações; ver [Entradas do núcleo](ENTRADAS-DO-NUCLEO.md).

### Áreas por material — implementadas

Decomposição de cada fatia em subáreas até o arco, incluindo regiões côncavas, inclusões que não tocam a base, interfaces compartilhadas e solo de fundo. Agregação por ID com origem das parcelas, conservação por fatia e global, limites de capacidade e inspeção na interface. O contrato geométrico passa a `geostruct-fixed-geometry/2`, sem alterar o projeto v4. Sem pesos ou propriedades equivalentes. Ver [Áreas por material](AREAS-POR-MATERIAL.md).

### Peso próprio por material e fatia — implementado

Aplicação do recorte aprovado de D2: soma de peso específico total × subárea, em kN/m, sem usar apenas o material da base ou inferir γ seco/saturado/submerso. Contrato independente `geostruct-slice-weights/1`, com revisão/perfil, totais e origem de cada parcela. γ ausente preserva as áreas e bloqueia os pesos, sem total parcial. Inspeção, rascunhos, histórico e arquivo v4 preservados. Ver [Pesos das fatias](PESOS-DAS-FATIAS.md). Pressões e sobrecargas são preparadas separadamente; o método consome a consolidação.

### Pressões prescritas nas bases — implementadas

Recorte de D2 com altura vertical no ponto médio angular do arco, γw informado e u em kPa; zero por condição seca explícita ou na linha/acima dela. Cobertura de todo o candidato sem extrapolação, diagnóstico de carga acima do terreno e preservação de geometria/pesos. Inspeção de pontos, alturas, segmento e origem; resultados somente na sessão, sem pressão usada na resistência, resultantes de água ou FS. Ver [Pressões nas fatias](PRESSOES-NAS-FATIAS.md), inclusive as limitações enquanto R1/R2 seguem em revisão.

### Resultantes das sobrecargas — implementadas

Recorte de D3: Q = q × largura horizontal carregada, ponto médio do trecho com cota do terreno, braço próprio e momento com sinal. Contrato `geostruct-slice-loads/1`, mesma revisão/perfil, totais por faixa/fatia e contribuições com ID/origem. Sobreposições somam; q nulo contribuinte bloqueia sem total parcial. Sentido ausente mantém momentos CCW e deixa campos orientados pendentes. Inspeção, casos analíticos e arquivo v4 preservado. Ver [Sobrecargas nas fatias](SOBRECARGAS-NAS-FATIAS.md). Sem equilíbrio ou aceite integral de R0–R6.

### Entrada mecânica por fatia — implementada

Consolidação de geometria, peso, água e sobrecargas com revisão/perfil coerentes, ordenação no movimento e coordenadas locais. Parâmetros resistentes do material da base, α e braço aproximado do peso; braços próprios das faixas preservados. u/U físicos separados de ue/Ue conforme modo efetivo/total, com inspeção e bloqueios de dados incompletos. Contrato `geostruct-slice-mechanics/1`, sem resultados no arquivo v4. Ver [Entrada mecânica das fatias](ENTRADA-MECANICA-DAS-FATIAS.md). Não avalia normal, resistência mobilizada, tração, equilíbrio, FS ou admissibilidade do modo misto.

### Fellenius em círculo fixo — implementado no recorte inicial

Variante projetada de D1, normal aproximada, resistência por base, braços próprios das faixas e FS do círculo informado. Perfil explícito, diagnósticos de momento motriz, tração, finitude e resistência nula; inspeção das parcelas e invalidação por revisão. Recusa faces verticais no intervalo da massa e mistura de modos nas bases. Regras locais e evidências em [Fellenius em círculo fixo](FELLENIUS-CIRCULO-FIXO.md), sem aceite integral da candidata, busca ou critério normativo.

### Bishop Simplificado em círculo fixo — implementado no recorte inicial

Formulação D1 com `ue b` no numerador reduzido, ponto fixo, resíduo no F avaliado, perfil explícito e histórico das tentativas. Singularidade, não convergência, resistência nula e tração possuem diagnósticos próprios. Comparação com Fellenius na mesma entrada/fatias exige limiares comuns iguais e dois resultados positivos admissíveis. Regras e casos em [Bishop em círculo fixo](BISHOP-CIRCULO-FIXO.md); sem busca ou aceite integral da candidata.

### Busca circular determinística — implementada no recorte inicial

D5 orienta a malha de centros X/Z e raios, com preparação compartilhada e classificação por método. A interface mostra progresso, cancelamento, mínimo admissível, bordas, empates e contagens por motivo. A inspeção reproduz o candidato e permite conferir o refinamento das fatias. Veja [Busca circular](BUSCA-CIRCULAR.md).

### Referências e decisões

- [#28 — Roadmap](https://github.com/ricardocorsini/openstruct-front/issues/28): primeiro motor determinístico 2D, superfícies circulares, Mohr–Coulomb, Fellenius e Bishop Simplificado.
- [#29 — Bibliografia](https://github.com/ricardocorsini/openstruct-front/issues/29): seleção aprovada pelo Eng. Gustavo Azocar. Referências principais: Duncan, Wright e Brandon (2014) e USACE EM 1110-2-1902 (2003).
- [#30 — Especificação](https://github.com/ricardocorsini/openstruct-front/issues/30), [PR #37](https://github.com/ricardocorsini/openstruct-front/pull/37): documento candidato; D1–D5 aprovadas como base, R0–R6, consulta direta de Bishop e aceite final pendentes na consulta de 17/11/2026.
- [#31 — Validação](https://github.com/ricardocorsini/openstruct-front/issues/31): catálogo de casos independentes e tolerâncias ainda pendente na mesma consulta.

Os testes de modelagem deste repositório não substituem os casos geotécnicos da #31. Os exemplos têm números ilustrativos, sem origem experimental e sem resultados de estabilidade associados.

## Sequência proposta

1. Geometria e edição: implementadas nesta evolução; revisar o uso em modelos reais.
2. Materiais, atribuição explícita, água e sobrecargas: implementados no recorte inicial. As regras físicas que combinam materiais/água dependem do contrato do motor.
3. Casos de análise: implementados no recorte de cadastro e prévia, com identidade própria e vínculo à seção.
4. **Conferência integrada e distribuição 0.1.0 — implementadas:** escopos por seção/caso, dependências compartilhadas, navegação, relatório, limite de arquivo simétrico e instaladores Windows/Linux disponíveis no Launcher. A homologação manual nativa completa continua pendente.
5. **Contrato de transferência de entradas — implementado.** O recorte aprovado de D2 já sustenta o peso próprio. Concluir as regras restantes da especificação #30 e o catálogo #31 para os próximos cálculos: perfis numéricos, tratamento das faces verticais, água e comportamento de falhas.
6. **Preparações, entrada mecânica, Fellenius e Bishop em círculo fixo — implementados no recorte documentado.**
7. **Busca circular determinística — implementada no recorte documentado.** Próxima etapa: comparar casos de referência com superfícies conhecidas e malhas refinadas, revisar #30/#31 e preparar um relatório de resultados que preserve as hipóteses da análise.
8. Especificar métodos rigorosos, superfícies não circulares e estabilidade com reforços. Especificar separadamente verificações/dimensionamento das contenções.

A distribuição desktop exige revisão nativa, instaladores, notas, catálogo/Launcher e procedimento de atualização. Compilação de CI não publica uma versão e não dispensa essa revisão.

Slide2 e GEO5 são referências de produto e comparação controlada. Seus padrões de tela, exemplos ou configurações não substituem decisões de engenharia nem servem, isoladamente, como fonte governante das equações. Critérios normativos de aceitação têm etapa própria.
