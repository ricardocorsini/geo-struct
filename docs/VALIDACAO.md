# Validação do GeoStruct

## Verificações executáveis

- `npm run check`: tipos TypeScript e testes do domínio. Cobertura de geometria, interseção/cobertura de regiões, linhas, água, faixas, leitura/limites de arquivo, IDs, duplicação, números e histórico.
- `npm run build`: aplicação web compilada.
- `npm run test:e2e`: uso real no Chromium, incluindo criação, edição, rascunhos, arraste, cancelamento, undo/redo, seções, arquivos, recuperação, relatório e janela mínima.
- `npm run format:check`: consistência de formatação.
- Workflow `Validate and build`: repete as verificações e compila o executável Tauri em Ubuntu 24.04 e Windows. Não publica release nem integra o catálogo.

Os artefatos do CI incluem traces de falhas, sem capturas de imagens. Resultados de uma execução específica devem ser conferidos pelo SHA no GitHub Actions.

### Importação CSV — primeiro incremento da #9 (19/11/2026)

Validação local no Windows com Node 24.22.2, a partir da master `de00f77`, na branch `issue-9-importacao-csv`:

- Instalação limpa: `npm ci --offline --cache ../npm-cache --maxsockets=1` concluída com o cache local, sem alterações de dependências.
- `npm run check -- --maxWorkers=2`: **490 testes passaram**, incluindo 39 de interpretação/aplicação CSV e 16 de leitura web/adaptador nativo.
- `npm run test:e2e -- --workers=2`: **93 testes passaram** no Chrome local via Playwright, incluindo sete cenários CSV e os fluxos anteriores.
- `npm run build` e `npm run format:check`: aprovados. O build mantém avisos de tamanho do bundle e anotações da dependência Zod.

Os casos CSV verificam unidades m/cm/mm, escolha de cabeçalho e colunas, separadores e aspas, limites e UTF-8 inválido, equivalência com X/Z manual, geometria inválida, isolamento de regiões/seções, cancelamento e histórico em uma operação. O fechamento cancelado preserva a prévia. Também foi conferida a janela mínima de 960 × 640 no tema claro e a janela de 1280 × 720 no tema escuro.

Os testes do adaptador nativo usam mocks: não comprovam o seletor, as permissões ou o uso real no Tauri. Compilações desktop no CI e homologação nativa permanecem pendentes nesta entrega local. O formato permanece `geostruct/4`; cálculos e critérios geotécnicos não foram alterados. A importação DXF continua pendente na #9.

### Evolução da geometria e edição

Testes adicionais verificam interfaces com subdivisões diferentes, conservação de área e ausência de sobreposição após editar/dividir, limites de pontos, identidades/materiais, cópia inválida, precisão/captura e faces verticais. O arquivo de exemplo da primeira versão é lido e regravado sem alterar seus dados. Os fluxos de interface cobrem edição compartilhada e histórico, inserção/exclusão gráfica, divisão com persistência, rejeição de cópia, deslocamento relativo, medição sem modificar o modelo e entrada de face vertical na janela mínima.

Asserções de geometria não são validações das forças sobre faces verticais. O recorte de Fellenius/Bishop recusa faces verticais no intervalo da massa. Não se executa geração/conversão de imagens nos testes; traces são mantidos sem screenshots.

### Materiais e arquivos

Os testes verificam atribuição explícita/nula, zero de coesão/atrito, escolha de tipo de resistência, limites de cadastro, duplicação independente, atribuição em lote isolada por seção e substituição/exclusão em todas as seções com histórico único. Cobrem lista vazia de materiais, referências inválidas, preservação dos dados v1 na migração para o formato atual e recusa de campos desconhecidos. Os fluxos Chromium exercitam o gerenciador na janela mínima, rascunhos, pendências, relatório, persistência, recuperação antiga e navegação aos usos do material.

Os limites numéricos são limites do cadastro de software. “Dados preenchidos” não é validação dos parâmetros de engenharia ou condição de cálculo.

### Água, cargas e formato v3

Testes de domínio verificam estados explícitos, retenção ao desativar, q nulo/zero, origem, limites estruturais, ativação inválida, cobertura, linha acima de vértice interior/face vertical, intervalos sobrepostos e contato nas bordas. Incluem exclusão da última faixa, cópia desabilitada, histórico, isolamento e distinção entre erros iguais de seções diferentes. Leitura de v1/v2 preserva IDs e dados, mantém ausência como não definida e recusa campos desconhecidos.

Os testes Chromium cobrem condição seca e reativação, edição decimal/rascunhos, desenho de linha/faixa, relatório, persistência, gerenciador na janela mínima, habilitação, duplicação, exclusão, navegação a pendências de outra seção e rejeição de ativação fora do terreno. Nenhuma verificação calcula pressão, esforço ou FS.

### Casos de análise e formato v4

O domínio cobre criação com escolhas pendentes, condições herdadas e próprias, seleção de faixas independente da seção, duplicação/exclusão com histórico, limite de casos, referências cruzadas e remapeamento ao duplicar a seção. Valida círculo incompleto, raios/passos inválidos, eixos fixos, limites invertidos, troca de modo sem perda e diagnósticos dos cenários. A migração de v1/v2/v3 preserva os dados e não inventa casos.

Os fluxos Chromium verificam criação, edição, rascunhos, desenho/cancelamento, cópia do círculo de tentativa, prévia de condições, busca sem geração de candidatos, arquivo e relatório, gerenciador na janela mínima, exclusão de faixa referenciada, operações de seção com casos, navegação por diagnóstico e recuperação v3. As verificações não validam interseções do círculo, admissibilidade física, malha de candidatos ou FS.

### Perfil numérico e ação Calcular caso

Os testes de domínio verificam os grupos persistidos no formato v5, migração com campos pendentes e independência dos perfis por caso, modo e método. A prontidão distingue rascunhos, dados físicos ausentes, condições ativas, superfície, perfil efetivo e limites da malha, conservando os diagnósticos existentes. Configurações inativas e materiais sem uso não recebem valores presumidos nem impedem a execução. A identidade inclui o perfil efetivo, mesmo quando a revisão da entrada física não muda.

Os testes da orquestração verificam uma única preparação comum do círculo fixo, a mesma mecânica para os métodos selecionados, equivalência com os solvers existentes e preservação de falhas independentes. Cobrem diagnósticos sem FS e a conservação de geometria/pesos quando a pressão é bloqueada. Testes do executor usam timers controlados e um adaptador de Worker para verificar progresso, cancelamento sem resultado parcial, reinício, desmontagem, falhas de execução e rejeição de respostas de outra geração, caso ou perfil.

Os fluxos Chromium exercitam **Análise → Calcular caso** por botão e teclado na janela mínima, círculo fixo e busca, métodos selecionados, comparação, navegação às pendências em **Conferir modelo**, rascunhos e correção de perfil inválido. Incluem progresso/cancelamento, mudança de contexto e preservação do arquivo sem resultados. As inspeções e ações individuais continuam cobertas pelos fluxos próprios de geometria, preparações e métodos. Esses testes verificam a coordenação da execução; a evidência de engenharia permanece nos casos independentes de cada recorte.

### Aba Resultados e seleção sincronizada

Os testes do estado de resultados distinguem registros atuais, desatualizados e ausentes por projeto, caso, sessão e identidade efetiva. Cobrem retorno ao resultado de outro caso já calculado, rascunho e descarte, alteração de perfil/entrada, reabertura com os mesmos IDs e início de nova execução sem reaproveitar resultados parciais. A comparação exige resultados completos da mesma superfície e recusa revisão, círculo, discretização ou limiares diferentes, bem como resultados sem FS positivo admissível.

O controlador de inspeção da busca usa um adaptador de Worker para conferir seleção de candidato, geração, referência do registro, cancelamento e desmontagem. As respostas atrasadas de outra seleção ou sessão não podem atualizar a superfície apresentada. A seleção de método e fatia é vinculada aos números originais da geometria preparada.

Os fluxos Chromium cobrem a aba em 960 × 640, abertura e seleção por teclado, círculo fixo, 27 candidatos, mínimo do candidato 25 com avisos de borda e distinção entre comparação no mesmo círculo e mínimos por método. As parcelas exibidas usam valores congelados do catálogo STRAT: o candidato 14 corresponde ao círculo fixo e permite comparar peso e normal de uma mesma fatia nos dois métodos, incluindo sua inspeção completa. O SVG é conferido por dados/DOM para candidato, método e fatia realçada. Incluem cache por caso, rascunhos preservados entre abas, invalidação por entrada/perfil, não convergência, resistência nula com FS zero distinto de ausência de FS, rejeição, descarte geométrico, círculo fixo sem interseções conservando seu contorno diagnóstico e cancelamento com progresso sem resultado parcial. Os arquivos continuam sem resultados serializados.

Essas verificações exercitam a apresentação e a identidade dos dados; não ampliam o alcance dos [casos de referência](CASOS-DE-REFERENCIA.md), alteram suas fontes ou substituem a revisão de engenharia dos recortes físicos.

## Limites

### Catálogo independente de preparação e métodos

Os [casos de referência](CASOS-DE-REFERENCIA.md) preservam os sete controles da entrega da [openstruct-front #31, publicada em 20/11/2026](https://github.com/ricardocorsini/openstruct-front/issues/31#issuecomment-7047662690), com alcance separado: cinco secos/79 fatias percorrem o preparo completo; A01/A01-B/48 fatias verificam as equações em fatias prescritas e, separadamente, o bloqueio geométrico `cuts-too-close`. O último segmento de água é colinear com o terreno; raízes distintas por cerca de 1,42×10⁻¹⁴ m são colapsadas pelo arredondamento histórico da referência, mas preservadas pelo preparador atual. Não se mudou a política R3 ou a tolerância para fazer esses casos passarem.

H-W05 acrescenta 15 fatias de solo homogêneo com pressão positiva, verificadas desde a preparação; é um novo caso próprio, sem publicação ou aceite humano anteriores. STRAT acrescenta o caso ilustrativo estratificado com água e sobrecarga, o círculo fixo e a avaliação independente dos 27 candidatos em aberturas de 3° e 1,5°, com identidade do mínimo, bordas e contagens por método. Reprodutores Python usam somente a biblioteca padrão, sem saídas do GeoStruct para gerar os esperados. P0/P1, intermediários, estados e trajetória de Bishop são preservados; A01 converge mas é rejeitado por tração somente na camada com fatias prescritas, sem alegar preparo integrado bem-sucedido. O documento registra tolerâncias por grandeza, a matriz R0–R6, reprodução com `--check`, limites de geometria/modos mistos e a revisão humana pendente na #44. As referências não calibram defaults universais nem declaram mínimo global ou conformidade normativa.

### Fellenius em círculo fixo

Casos analíticos conferem normal projetada, coesão/atrito, força de carga constante com braços distintos, sinais e FS. A transcrição de nove fatias de Duncan fig. 7.34 reproduz FS ≈ 1,186281 após conversão SI, distinguindo a variante C-12 da C-13. O modelo próprio com preparação completa verifica refinamento, translação, espelhamento/sentido e água/modo. Testes de diagnóstico cobrem limiares exatos, tração tolerada/rejeitada sem corte para zero, resistência nula e soma não positiva, cancelamento, finitude, underflow, revisão, método selecionado, modos mistos e face vertical.

Fluxos Chromium cobrem limiares obrigatórios, inspeção na janela mínima, alteração de perfil/dados, rascunho, histórico, isolamento de casos, arquivo sem resultados, resistência nula e tração. As referências, políticas e limites da evidência estão em [Fellenius em círculo fixo](FELLENIUS-CIRCULO-FIXO.md). O benchmark publicado verifica a equação nas fatias transcritas; não valida a reconstrução geométrica ou a busca do exemplo. A admissibilidade de Bishop é verificada separadamente; não há aceite normativo.

### Busca circular

Casos próprios verificam a ordem dos três eixos, ajuste do último ponto pela tolerância, preservação do passo, eixos fixos, limites de representação e recusa de malhas excedentes. Uma classificação com valores de FS prescritos verifica o menor valor sem arredondamento, a primeira ocorrência entre iguais, quase empates, borda amostrada e estados distintos para falha e resistência nula. A malha de um talude compara os candidatos com os mesmos círculos no modo fixo. Casos com água insuficiente ou acima do terreno exercitam os motivos por etapa e a cobertura parcial.

Os fluxos Chromium cobrem a malha, o menor FS por método, os descartes, a inspeção na janela mínima, o refinamento, o cancelamento de um Worker com progresso, o isolamento de casos, o histórico e a preservação do arquivo. Consulte [Busca circular](BUSCA-CIRCULAR.md) para o alcance dos casos.

### Bishop Simplificado em círculo fixo

O caso de uma fatia compara o ponto fixo com a raiz obtida algebricamente, conserva o braço próprio da carga e verifica equilíbrio vertical/resistência no próprio F retornado. Dez fatias transcritas de Duncan fig. 7.40 reproduzem D, numerador em F = 1,6, solução ≈ 1,61302 e resíduo; o perfil de referência exige cinco avaliações. A fonte da transcrição e suas limitações estão em [Bishop em círculo fixo](BISHOP-CIRCULO-FIXO.md).

Os testes cobrem aceitação na primeira/última avaliação, limiar exato, falta de convergência, singularidade dependente de F₀, normais transitórias versus convergidas, tração/avisos, zero físico distinto de cancelamento, finitude, underflow, identidade da entrada e imutabilidade. O preparo completo cobre refinamento, água, modo, translação e espelhamento. Fluxos Chromium exercitam perfil, inspeção, comparação compatível/incompatível, método sozinho, falhas, rascunhos, edição, histórico, arquivo e isolamento de casos. Não elegem método vencedor, superfície crítica ou aprovação normativa.

### Entrada mecânica das fatias

O caso independente de corda de 2 m a 30°, W = 100, Q = 15 e u = 10 confere b = √3, V = 115 e U = 20, em unidades coerentes, sem calcular normal ou FS. A geometria circular analítica verifica pressão central, comprimento de corda e braço aproximado do peso. Testes distinguem u/U de ue/Ue, mantêm a pressão física em modo total, usam resistência somente do material da base e preservam modos distintos em bases diferentes. Incluem c/φ zero ou nulos, parâmetros inválidos, faixas sobrepostas e com momentos opostos, ordem/espelhamento, translação, escala e refinamento.

A consolidação verifica revisão/perfil, estágios indisponíveis, correspondência por número, pontos/áreas de outra discretização, valores não finitos e underflow. O resultado é copiado e congelado sem alterar ou congelar os objetos mutáveis fornecidos. Fluxos Chromium cobrem inspeção na janela mínima, mudança de modo, sentido e condições próprias, rascunho, completar coesão nula com zero, arquivo/reabertura e desfazer/refazer com reseleção do caso. Ver [Entrada mecânica das fatias](ENTRADA-MECANICA-DAS-FATIAS.md). As verificações não representam validação de estabilidade ou aceite dos recortes restantes da especificação.

### Resultantes das sobrecargas nas fatias

Integrais analíticas independentes conferem 20 kPa em [−2,0] como 40 kN/m e +40 kN·m/m sobre xc = 0; cargas espelhadas mudam o sinal CCW e conservam o momento orientado ao inverter o sentido. Conferem recorte parcial, ponto próprio do trecho carregado, terreno inclinado, sobreposição por ID, força positiva com momento zero, contribuições negativas, contato sem largura, faixa fora da massa, q zero/nulo, condições próprias/herdadas e sentido pendente. Escala, translação e refinamento preservam os balanços. Há verificações de revisão, imutabilidade, independência de pesos/pressões, entrada inválida, overflow/underflow e cancelamento numérico.

Fluxos Chromium cobrem inspeção na janela mínima, origens, pontos e braços, rascunhos, refinamento, arquivo sem resultados, reabertura, q ausente/zero, edição e desfazer/refazer com reseleção do caso, faixas desabilitadas selecionadas por caso próprio e ausência explícita. Ver [Sobrecargas nas fatias](SOBRECARGAS-NAS-FATIAS.md). Essas verificações não validam equilíbrio, FS ou critérios normativos.

### Pressões de água nas fatias

Os casos independentes verificam 5 kPa para h = 0,5 m e γw = 10 kN/m³, a lei linear de uma linha inclinada e o uso do ponto angular do arco em vez do centro da corda/largura. Conferem pressão zero na linha/acima dela, condição seca explícita, origem por segmento, cobertura nas extremidades e cobertura parcial da seção suficiente para o candidato. Incluem nós de água/terreno e face vertical na conferência de carga acima do terreno, γw ausente/inválido, produto não finito/subfluxo, pressão pequena positiva, modos de resistência, independência dos pesos, revisão e imutabilidade. Escala, translação, espelhamento e refinamento são comparados com a lei de pressão, sem somar pressões como forças. A regressão das raízes confere segmentos horizontais longos e evita falso corte próximo nas extremidades da linha de água.

Os fluxos Chromium verificam inspeção na janela mínima, rascunhos, edição de γw, desfazer/refazer, isolamento de caso seco, carga acima do terreno, cobertura incompleta e recuperação após completar os dados. O arquivo permanece sem resultados. Essas verificações não validam u usado na resistência, forças de água, equilíbrio ou FS. Ver [Pressões nas fatias](PRESSOES-NAS-FATIAS.md).

### Peso próprio das fatias

Os casos independentes verificam `2 × 18 + 3 × 20 = 96 kN/m`, área analítica de segmento circular homogêneo, estratos horizontais e inclusão de área conhecida acima da base. Conferem γ por material/ID, parcelas por região/fundo, totais, precisão sem arredondamento intermediário, refinamento, escala, translação e espelhamento. Cobrem γ nulo/inválido, material sem contribuição, perda de representação, somas não finitas, origem inconsistente, revisão, imutabilidade e arquivo preservado. Água, sobrecargas e modos de resistência não alteram o peso específico informado ou acrescentam forças ao peso próprio.

Os fluxos Chromium verificam consulta por material/fatia na janela mínima, rascunhos, isolamento entre casos, refinamento, edição de γ, desfazer/refazer, dados ausentes e salvamento sem resultados no arquivo. A geometria continua disponível quando os pesos estão bloqueados. São verificações do recorte de D2; não validam pressão, equilíbrio, FS ou estabilidade. Ver [Pesos das fatias](PESOS-DAS-FATIAS.md).

### Áreas por material

Os casos próprios comparam estratos horizontais e inclinados com áreas analíticas de segmentos circulares, divisões verticais com meias áreas e inclusões retangulares, triangulares e côncavas com áreas conhecidas. Conferem composição por fatia e global, fundo, origens, materiais distintos de mesmo nome, material compartilhado entre regiões, falta de atribuição acima da base, regiões sem contribuição, áreas finas positivas, interfaces subdivididas e limites antes da expansão. Refinamento, ordem, orientação dos contornos, escala, translação e espelhamento preservam as áreas esperadas. Uma discrepância deliberada não é corrigida por redistribuição. Os fluxos de interface verificam consulta por material/fatia, rascunhos/revisão, atribuição, desfazer/refazer e arquivo preservado. Não há validação de pesos, pressões ou FS. Ver [Áreas por material](AREAS-POR-MATERIAL.md).

### Geometria do círculo fixo

Os testes conferem interseções e área total contra o segmento circular analítico de raio 5 m e centro (0, 4), translação, escala, refinamento, ramo inferior, vértices compartilhados, faces verticais, material na base e cortes efetivos de água/cargas. Casos negativos cobrem tangência, domínio truncado, contato com a base, cruzamentos adicionais, cobertura da água, seleção vazia, campos/perfil inválidos, interfaces ambíguas e capacidade antes da expansão. A tabela e o desenho são testados por dados/DOM, sem capturas de imagem; os fluxos incluem rascunhos, alteração compartilhada, troca de caso, histórico e preservação do arquivo v4. São testes de geometria, sem benchmark de forças ou FS.

### Entradas do núcleo

Os testes do adaptador cobrem origem/unidades, conversão X/Z sem espelhamento, nulos/zeros, herança e seleção própria, estados inativos, faces verticais, busca declarada, referências inválidas, imutabilidade e revisão determinística. Incluem alterações menores que a tolerância do editor, isolamento de outras seções e materiais sem uso, preservação v4 e desfazer/refazer. Os fluxos Chromium verificam a conferência no caso, rascunhos, atualização após editar material compartilhado e ausência de dados derivados no arquivo. Não executam fatias, equações ou benchmarks de FS. Consulte [Entradas do núcleo](ENTRADAS-DO-NUCLEO.md).

### Alcance das verificações

As verificações cobrem o modelador, as preparações, os recortes de Fellenius/Bishop em círculo fixo e a busca em malha. Os casos analíticos, as fatias transcritas e o [catálogo independente](CASOS-DE-REFERENCIA.md) verificam equações, preparação e classificação nas condições documentadas. A publicação e o aceite das referências da #31 não encerram a homologação em casos de projeto. A revisão humana independente segue na [openstruct-front #44](https://github.com/ricardocorsini/openstruct-front/issues/44), os cenários geométricos adicionais na [#45](https://github.com/ricardocorsini/openstruct-front/issues/45), e o aceite integral da especificação continua na [#30/PR #37](https://github.com/ricardocorsini/openstruct-front/pull/37).

Compilar um executável nativo não comprova sua interação com todos os ambientes. Antes de distribuir instaladores, conferir manualmente em Linux e Windows: abrir/salvar, cancelamento de diálogo, permissões, fechamento com alterações, impressão, escala de tela, zoom/pan e teclado. Validar Linux WebKitGTK e Windows WebView2 além do Chromium dos testes.

A recuperação usa armazenamento local e pode ser bloqueada pelo navegador. O caso deve produzir aviso sem substituir a responsabilidade de salvar arquivo. Arquivos com geometria inconsistente são abertos com diagnósticos, sem conferir aprovação de estabilidade.

## Conferência integrada dos lançamentos

Em **Análise → Conferir modelo**, filtre por seção/caso e severidade. Cada caso inclui a geometria e os materiais compartilhados, além das condições efetivas de água/cargas do cenário. Materiais sem uso aparecem em um escopo próprio. Clique numa pendência para abrir o cadastro correspondente; rascunhos continuam protegidos. O relatório de entradas inclui a mesma conferência por escopo. Pendências compartilhadas aparecem em cada caso afetado, portanto as contagens não são somáveis como ocorrências únicas.

A conferência é derivada dos dados aplicados e não altera o formato v5 ou cria resultados. Ausência de pendências não comprova admissibilidade das superfícies nem estabilidade. Testes cobrem dependências compartilhadas, isolamento, condições próprias, ida/volta do arquivo, navegação e rascunhos. O salvamento recusa projetos acima de 8 MB para evitar produzir um arquivo que o leitor rejeitaria; o modelo aberto permanece disponível para edição.
