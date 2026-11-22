# Guia de uso — GeoStruct 0.2.0

## Primeiro projeto

Escolha **Novo projeto**, informe nome e, se desejar, responsável. A seção inicial não tem terreno nem material de fundo atribuído. O cadastro inicial começa com parâmetros e tipo de resistência em branco. **Explorar um exemplo** abre um modelo próprio em duas camadas, com dados ilustrativos claramente identificados e materiais já atribuídos.

Em **Geometria → Perfil do terreno**, marque os pontos da esquerda para a direita. Enter ou Concluir finaliza; Escape cancela; Backspace ou botão direito remove o último ponto. Regiões são fechadas automaticamente. O primeiro contorno do terreno deve ficar acima da cota da base indicada no painel.

Também é possível digitar a tabela X/Z nas propriedades. **Colar lista de coordenadas** aceita uma linha por ponto, com valores separados por ponto e vírgula, tabulação ou espaço. O separador decimal pode ser ponto ou vírgula. Exemplo:

```text
0 ; 20
15,5 ; 20
30 ; 8
50 ; 8
```

Clique em **Usar coordenadas**, confira a tabela e **Aplicar**. Os campos são um rascunho: sair deles para outro elemento oferece a opção de continuar editando ou descartar. O desenho não é modificado por um valor ainda não aplicado.

### Importar coordenadas CSV

Selecione **Terreno** ou uma região de solo na árvore e clique em **Importar CSV** nas propriedades. Aplique ou descarte antes qualquer alteração pendente dessas propriedades. A importação substitui a lista inteira de pontos do contorno selecionado; não acrescenta pontos à lista nem altera os contornos vizinhos por inferência de vínculos.

1. Escolha um arquivo `.csv` em UTF-8, com BOM opcional. O limite é de 1 MiB (1.048.576 bytes), 64 colunas e 500 pontos. Não use separadores de milhares nos campos numéricos.
2. Confira **Separador** e **Separador decimal**. O separador inicial é `;` e o decimal inicial é vírgula. Também há vírgula ou tabulação entre campos e ponto decimal. Não é permitido escolher vírgula nas duas funções; por exemplo, um CSV separado por vírgulas deve usar ponto decimal.
3. Em **Primeira linha**, escolha explicitamente **Cabeçalho** ou **Coordenadas**. A opção não é deduzida do conteúdo. Se houver cabeçalho, ele identifica as opções de coluna e não vira um ponto.
4. Informe a **Unidade do arquivo**: m, cm ou mm. Escolha as colunas **X** e **Z**; as outras colunas são ignoradas. Campos entre aspas podem conter o separador e aspas internas duplicadas, conforme CSV.
5. Confira a **Prévia das coordenadas em metros**, a ordem dos pontos e os erros indicados. Só use **Aplicar contorno** quando a prévia estiver correta. A conversão afeta X e Z: 1.000 cm correspondem a 10 m; 1.000 mm correspondem a 1 m.

O terreno exige ao menos dois pontos na ordem da esquerda para a direita e pode conter faces verticais. Uma região exige ao menos três pontos, contorno simples, área não nula e posição dentro da seção, sem sobreposição com outras regiões. Liste cada vértice uma vez, sem repetir o primeiro ao final: o editor fecha a região automaticamente. Valem as mesmas coordenadas-limite, base e validações da edição X/Z. A importação conserva a ordem dos pontos, sem arredondar pela grade, ajustar a escala automaticamente ou corrigir geometria inválida.

**Aplicar contorno** confirma uma única operação de **Desfazer/Refazer**. A região conserva ID e material; outros elementos e seções permanecem iguais. O arquivo escolhido e as configurações de leitura não são gravados no projeto: somente as coordenadas confirmadas em metros entram no `.geo.json`, no formato corrente v5. Erro de leitura ou de geometria conserva o projeto. Escolher outro arquivo invalida a prévia anterior; confira a nova leitura antes de aplicar.

**Cancelar**, Escape ou **Fechar janela** descartam somente a importação ainda não aplicada. Enquanto o diálogo está aberto, a navegação e o fechamento continuam protegidos. Após aplicar, salve o projeto normalmente. CSV não importa materiais, água, cargas, casos de análise ou resultados; DXF/DWG permanecem pendentes.

Exemplos próprios em `examples/`, sem dados de projeto real:

| Arquivo                                                              | Configuração                                                     | Resultado                                        |
| -------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------ |
| [terreno-coordenadas-m.csv](../examples/terreno-coordenadas-m.csv)   | `;`, vírgula decimal, cabeçalho, m, X = coluna 1 e Z = coluna 2  | (0; 12), (10; 12), (20; 8) m                     |
| [terreno-coordenadas-cm.csv](../examples/terreno-coordenadas-cm.csv) | `;`, vírgula decimal, cabeçalho, cm, X = coluna 1 e Z = coluna 2 | Mesmo terreno, convertido de centímetros         |
| [regiao-colunas-mm.csv](../examples/regiao-colunas-mm.csv)           | `;`, vírgula decimal, cabeçalho, mm, X = coluna 3 e Z = coluna 2 | Retângulo de 6 m × 4 m; coluna de nomes ignorada |

## Calcular o projeto padrão

Na tela inicial ou em **Arquivo → Projeto**, escolha **Abrir projeto padrão**. A cópia é editável e já abre na aba **Análise**, no caso **Talude — busca circular**. Para trocar o projeto aberto, o aplicativo aplica a mesma proteção de rascunhos e alterações da abertura de arquivos.

- **Talude — busca circular** tem 27 combinações de centro e raio. Clique em **Análise → Calcular caso** para executar Fellenius e Bishop Simplificado e abra **Resultados** para consultar os mínimos da malha e selecionar um candidato. Os valores iniciais podem ser conferidos ou editados em **Perfil de cálculo do caso**.
- **Talude — círculo fixo** avalia um dos círculos da malha, com centro X = 32 m, Z = 32 m e raio de 25 m. Selecione o caso na árvore e use **Calcular caso** para preparar as fatias e executar os dois métodos. Na aba **Resultados**, alterne o método e a fatia para consultar as parcelas da mesma superfície.

As duas análises usam a mesma seção de dois solos com coesão nula, linha piezométrica prescrita e uma faixa de 20 kPa na crista. Os dados são didáticos. O arquivo v5 guarda os dados do modelo, dos casos e seus perfis numéricos; resultados ficam na sessão. Abra o comando de projeto padrão novamente para iniciar outra demonstração.

## Solos, água e cargas

Em **Materiais → Novo material**, informe nome, cor, peso específico total, coesão, atrito, tipo de parâmetros e origem. Escolha tensões efetivas (c′, φ′) ou totais (c, φ) de acordo com os dados informados. A troca de opção conserva os números; não os converte nem presume condição de drenagem. Campos em branco permanecem pendentes, e zero em coesão/atrito é um valor informado. **Aplicar** confirma o cadastro.

O solo de fundo é definido nas propriedades da seção/terreno e preenche as áreas sem outra região. Novas seções e regiões começam como **Sem material**; selecione um material no painel e aplique. A cor neutra e o marcador de pendência identificam os locais sem atribuição. Esse estado não representa escavação ou vazio. Regiões podem compartilhar bordas, mas não sobrepor áreas.

Em **Materiais → Atribuir material**, escolha o material e marque os destinos da seção ativa. **Marcar sem material** seleciona somente os destinos pendentes; **Marcar todos** inclui o fundo e todas as regiões. **Aplicar atribuição** gera um único passo de histórico. Para retirar um vínculo, escolha explicitamente **Retirar atribuição — deixar sem material**. Se o material tiver cadastro incompleto, a atribuição é permitida e as pendências continuam visíveis.

**Gerenciar materiais** reúne o cadastro e mostra onde cada material é usado. Abra a lista de atribuições e clique em uma para localizar a região/seção. **Editar** abre suas propriedades; **Duplicar** cria um cadastro independente sem novas atribuições. Excluir material em uso exige escolher outro para substituí-lo em todas as seções. A substituição e a exclusão são desfeitas juntas. Um material sem uso pode ser excluído, inclusive o último cadastro.

“Dados preenchidos” indica somente cadastro completo. O peso específico cadastrado continua sendo um único valor total por material; não são gerados valores secos, saturados ou submersos. Água e cargas são cadastradas e preparadas separadamente; sua aplicação segue os recortes documentados do núcleo.

Em **Água e cargas → Condição de água**, escolha **Condição seca** ou **Linha piezométrica prescrita** e registre a origem da hipótese. Projetos novos começam como **Não definida**. Para a condição piezométrica, informe também o peso específico da água γw em kN/m³ e a linha com X crescente, pelo desenho ou tabela. Desenhar uma linha ativa essa condição. Não é análise de percolação nem água externa; cobertura incompleta e linha acima do terreno geram avisos.

Alterar para seca/não definida guarda a linha, o peso específico e a origem sem usá-los no desenho. Reativar preserva os valores e verifica a geometria. **Excluir**, com água selecionada, remove somente a linha: a condição não passa automaticamente a seca. Também é possível salvar uma condição piezométrica com linha/peso ainda pendentes.

Em **Gerenciar cargas**, escolha **Sem sobrecargas** ou **Usar sobrecargas cadastradas**. O estado inicial **Não definida** é uma pendência. Essa escolha e as caixas de habilitação são aplicadas imediatamente, com desfazer. Cada faixa tem nome, limites X inicial/final, intensidade q (kPa), origem e habilitação própria. Só faixas habilitadas na condição de cargas ficam ativas.

**Desenhar nova faixa** usa dois pontos para definir o intervalo horizontal e ativa a condição de cargas. A intensidade começa **não informada**, nunca como zero presumido. Nas propriedades, preencha q e a origem e clique **Aplicar**. Vazio é pendência; q = 0 é um valor explícito. As setas só aparecem para q positivo. O carregamento cadastrado é vertical descendente e uniforme na projeção horizontal; faixas fora do terreno são recusadas, e sobreposições ativas são listadas para conferência.

Desabilitar uma faixa ou escolher **Sem sobrecargas** preserva todos os lançamentos. **Duplicar** cria uma cópia desabilitada, com ID próprio. Editar abre as propriedades; excluir exige confirmação. Excluir a última faixa não decide a condição da seção: escolha explicitamente Sem sobrecargas quando aplicável. Todas essas operações pertencem à seção ativa e ao histórico. Os dados inativos permanecem no relatório com sua identificação.

**Análise → Círculo de tentativa** recebe centro e um ponto do círculo. Centro/raio podem ser ajustados numericamente. Ele é uma referência geométrica; para avaliá-lo, copie-o explicitamente para um caso de círculo fixo e use **Calcular caso**.

## Navegar e editar

- Roda: zoom no cursor. Botão do meio ou Espaço + arrastar: mover vista.
- V: selecionar; H: mover vista; F: enquadrar; F3: captura.
- Captura procura vértices próximos, interseções, segmentos e depois a grade. Em **Geometria → Precisão**, configure o passo (inicialmente 0,5 m) e a restrição horizontal/vertical. F3 desliga a captura; a restrição ortogonal é uma opção separada.
- Selecione terreno, região ou água para exibir seus vértices. Arrastar um vértice gera um passo de histórico; alterações inválidas são recusadas com mensagem.
- Ctrl+Z desfaz e Ctrl+Shift+Z/Ctrl+Y refaz. Em campos de texto, esses atalhos conservam a edição nativa do campo.
- Arraste os divisores dos painéis ou use setas após focá-los com Tab.
- A faixa **Mostrar** controla a visibilidade de solos, água, cargas e círculo. Ocultar é apenas visual: não muda a condição ou habilitação dos lançamentos. Temas claro/escuro ficam no topo.

### Editar contornos e interfaces

Selecione o terreno, uma região ou a linha piezométrica antes de escolher **Inserir vértice**, **Excluir vértice** ou **Mover contorno**. Inserir usa um clique no interior de um segmento. Excluir usa um clique no vértice e mantém o mínimo de dois pontos no perfil ou três na região. Mover usa um ponto base e um destino, que definem o deslocamento.

Por padrão, **Editar interfaces de solo vinculadas** mantém juntas as fronteiras coincidentes entre terreno e regiões, inclusive quando os dois lados têm números diferentes de vértices. Desfazer reverte a operação completa. A água é independente. Desligue a vinculação em **Precisão** para editar só o contorno selecionado; a validação continua recusando sobreposição e saída do domínio. A edição pela tabela também acompanha as interfaces. Colar uma lista substitui apenas o contorno selecionado e não infere quais pontos antigos correspondem aos novos.

**Copiar região** exige uma região selecionada e dois pontos de deslocamento. Cria um novo ID e mantém o material original. **Dividir região** usa dois pontos para definir uma reta infinita de corte e cria duas regiões adjacentes com o mesmo material. Selecione cada parte para ajustar nome e material. Reta tangente/exterior ou corte que gera mais de duas partes é recusado. Copiar/dividir atua em regiões explícitas; o solo de fundo continua preenchendo o restante da seção.

O perfil pode conter faces verticais: use pontos consecutivos com o mesmo X e Z diferente. Continue avançando da esquerda para a direita; retornos e perfis em balanço não são aceitos. Uma face na extremidade não pode retornar sobre o fechamento lateral automático. A admissão geométrica não significa que o futuro motor já aceite o caso.

### Entrada precisa e medição

Durante o desenho ou comandos de dois pontos, abra **Entrada precisa** no canto inferior esquerdo. Escolha **X/Z**, **ΔX/ΔZ** a partir do último ponto, ou **Distância/ângulo**. O primeiro ponto precisa de X/Z ou clique. Ângulos são medidos a partir de +X, positivos em direção a +Z. Valores digitados são preservados, sem arredondamento pela grade ou restrição ortogonal. A tabela das propriedades continua disponível para coordenadas existentes.

**Medir** mostra distância, ΔX, ΔZ e ângulo entre dois pontos; não modifica o projeto. Um terceiro ponto inicia outra medição. Escape encerra. As preferências de precisão valem para a sessão e não são gravadas como parâmetros físicos no `.geo.json`.

## Casos de análise

Em **Análise → Novo caso**, cadastre um cenário da seção ativa. O caso começa com escolhas pendentes. Informe nome, hipóteses, direção e os métodos pretendidos. Direita/esquerda é sempre relativa ao eixo X do desenho; escolher movimento para a esquerda não espelha seus dados. Fellenius e Bishop estão disponíveis para círculo fixo e busca circular.

Em **Água no caso**, escolha usar a condição atual da seção ou adotar condição seca/usar a linha cadastrada. As hipóteses próprias exigem origem; a opção piezométrica usa os pontos e γw da seção, mesmo se a linha estiver guardada nela. Em **Sobrecargas no caso**, escolha a condição atual da seção, ausência de cargas ou faixas selecionadas. A seleção explícita pode ativar faixas desabilitadas na seção; mantenha isso como escolha consciente. Dados das faixas (q, posição e origem), geometria e materiais permanecem compartilhados.

Em **Definição da superfície**, escolha círculo fixo ou busca circular. Para o círculo, informe centro X/Z e raio, use **Desenhar círculo do caso** (dois pontos, também por Entrada precisa), ou **Copiar círculo de tentativa**. A cópia entra no rascunho e exige **Aplicar caso**; o desenho confirmado entra no histórico diretamente. O círculo de tentativa da seção não é alterado. Escape cancela o traçado.

Para busca, informe mínimos, máximos e passos dos centros X/Z e raios. Um eixo com mínimo igual ao máximo é fixo e pode ficar sem passo. Aplique o caso para conferir a malha no painel de busca. Limites invertidos e passos não positivos são recusados; vazios ficam pendentes. Alternar o modo preserva o círculo e os limites guardados.

Selecione o caso na árvore para ver sua prévia: condições de água/cargas, círculo fixo ou região de centros. A prévia não comprova a admissibilidade da superfície. Use **Enquadrar** para incluir os limites na vista. A edição da geometria base retorna pela árvore ou **Voltar à seção base**. Propriedades só mudam com **Aplicar caso**; a navegação protege rascunhos.

**Gerenciar casos** lista os casos da seção, seus estados e pendências, e permite editar, duplicar ou excluir. Duplicar seção duplica também seus casos com referências próprias; excluir seção avisa quantos casos serão removidos. Faixas selecionadas por casos não podem ser excluídas até retirar as referências, inclusive seleções guardadas em modos inativos. Desfazer/refazer reverte cada operação completa.

## Calcular o caso selecionado

Selecione um caso na árvore e use **Análise → Calcular caso**. No círculo fixo, uma ação prepara geometria, pesos, pressões, sobrecargas e entrada mecânica, depois avalia somente os métodos selecionados nas mesmas fatias. Na busca, a ação usa os limites, passos e perfil aplicados e executa a malha em segundo plano. O botão **Iniciar busca circular** nas propriedades aciona a mesma execução.

| Estado na Ribbon     | Significado                                                                          |
| -------------------- | ------------------------------------------------------------------------------------ |
| Pronto para calcular | Entradas e perfil necessários estão preenchidos; a superfície ainda será avaliada.   |
| Cálculo pendente     | Há rascunho, configuração incompleta ou erro de modelagem a corrigir.                |
| Calculando           | A execução está em andamento; a busca informa círculos avaliados.                    |
| Cálculo cancelado    | A execução foi interrompida e o resultado parcial descartado.                        |
| Cálculo concluído    | Consulte a aba Resultados e as inspeções, inclusive quando não houver FS admissível. |
| Falha no cálculo     | A execução não pôde iniciar ou terminar; a mensagem informa a falha.                 |

Ao usar o comando com dados pendentes, **Conferir modelo** permite localizar o cadastro a corrigir. Sem caso selecionado, abre-se o gerenciador de casos. Um rascunho mantém seus campos e pede aplicação, correção ou descarte. Complete atribuições de materiais, γ/c/φ/modo resistente, direção, métodos, superfície, água e cargas ativas e o perfil necessário ao modo atual. Campos nulos permanecem pendentes; perfis de métodos não selecionados e configurações inativas são preservados. Avisos sobre origem ou hipóteses continuam disponíveis para conferência.

Edite o perfil nas propriedades. Valores válidos são aplicados ao caso e entram no histórico; texto inválido permanece em edição e bloqueia **Calcular caso** e os métodos até ser corrigido ou descartado. **Cancelar cálculo** encerra a busca e permite repeti-la. A consulta de um resultado exige o mesmo caso, a mesma entrada e o mesmo perfil efetivo que o produziram.

As inspeções existentes recebem os resultados da ação central. Geometria, pesos, pressões, cargas e mecânica podem continuar disponíveis quando uma etapa posterior ou um método falha. Alterar somente um perfil de método retira FS e comparação, conservando preparações compatíveis para consulta. Para ΔFS, os dois métodos precisam de resultados positivos admissíveis nas mesmas fatias e de τD/τt iguais. **Preparar fatias**, **Calcular Fellenius** e **Calcular Bishop** continuam disponíveis para conferência por etapa. Conclusão da execução não representa aprovação de estabilidade.

## Consultar a aba Resultados

Após **Calcular caso**, abra **Resultados** na Ribbon. A árvore continua selecionando o caso, o desenho apresenta a superfície e o painel **Resultados do caso** reúne método, fator de segurança, validade e diagnósticos. A aba não altera a geometria nem aplica campos em edição; volte a **Análise** para editar o caso.

1. Em **Método do resultado**, escolha Fellenius ou Bishop Simplificado entre os métodos executados. Trocar o método mantém o círculo e a numeração das fatias.
2. Na busca, informe o número em **Superfície do resultado** e confirme com Enter ou ao sair do campo. **Superfície anterior**, **Próxima superfície** e **Ver superfícies avaliadas** também permitem navegar. A tabela de círculos mantém filtros, diagnósticos e paginação; selecione seu botão com Tab e Enter. O círculo escolhido é realçado no desenho; um candidato sem geometria preparada permanece disponível para consultar seu descarte.
3. Escolha **Fatia do resultado** ou clique na fatia desenhada. **Selecionar fatia pela tabela** oferece botões navegáveis por Tab e Enter e paginação para listas extensas. A fatia selecionada fica realçada e suas parcelas pertencem ao candidato e ao método indicados no painel.
4. Confira área, largura/base, α, W, Q, c/φ, pressão física u, pressão usada ue e resultantes U/Ue, além de normal e resistência quando avaliadas. As unidades aparecem em cada grandeza. “—” indica uma parcela indisponível ou não avaliada; zero continua sendo um valor calculado. **Inspeção completa** abre as tabelas existentes do método e das preparações da mesma superfície, incluindo a trajetória de Bishop.

**Mesma superfície** compara Fellenius e Bishop naquele círculo e só apresenta ΔFS com dois resultados positivos admissíveis, mesma discretização e τD/τt iguais. **Mínimos da malha por método** conserva o menor FS positivo admissível de cada método e seus avisos de borda, empates e descartes. Escolher outro candidato não altera esses mínimos. Um mínimo pertence à malha avaliada; não demonstra um mínimo global fora dela.

Sem convergência ou com rejeição, consulte os diagnósticos sem interpretar a última tentativa como solução. Resistência nula permanece distinta: Fellenius pode apresentar FS = 0, enquanto Bishop registra o estado sem FS numérico. Candidatos descartados continuam na tabela e não oferecem fatias que o preparo não produziu.

| Disponibilidade no painel                   | Como continuar                                                              |
| ------------------------------------------- | --------------------------------------------------------------------------- |
| Resultados da entrada e do perfil aplicados | Consulte superfície, método, fatia e diagnósticos.                          |
| Resultado desatualizado                     | Confira as alterações e recalcule; FS e desenho do resultado ficam ocultos. |
| Nenhum resultado nesta sessão               | Selecione um caso e use **Calcular caso**.                                  |

Os resultados concluídos são guardados por caso durante a sessão do projeto. Ao alternar para um caso ainda não calculado, o painel fica sem resultado; voltar ao caso anterior recupera seu resultado se as entradas e o perfil efetivo ainda correspondem. Alterar material, geometria, condições ou perfil relevante exige recálculo. Um rascunho também oculta o resultado; alternar entre **Análise** e **Resultados** preserva os campos, e **Descartar** permite recuperar o resultado quando os dados aplicados continuam iguais.

Durante a busca, o painel acompanha o progresso. **Cancelar cálculo** descarta os resultados parciais. Iniciar outra execução substitui a anterior daquele caso; cancelar ou falhar não recupera seu cálculo anterior. Abrir outro projeto, reabrir o mesmo arquivo ou fechar o projeto inicia uma sessão sem os resultados guardados. O `.geo.json` v5 conserva entradas e perfis, sem resultados, progresso ou seleção de candidato/fatia.

## Exportar o memorial de resultados

Na aba **Resultados**, selecione a superfície e o método e use **Memorial de resultados**. Escolha **Imprimir / PDF**, **Exportar HTML**, **Exportar candidatos CSV** (busca inteira) ou **Exportar fatias CSV** (todas as fatias da superfície e método selecionados). O memorial identifica caso, revisões, perfil e versões do motor, separa a comparação no mesmo círculo dos mínimos da malha e conserva os diagnósticos.

Resultados desatualizados, em preparação ou cancelados não são exportados como atuais. O comando preserva o rascunho e explica a pendência; o **Relatório de entradas** continua disponível com os dados aplicados. CSV usa UTF-8 com BOM, ponto e vírgula e decimal vírgula, com unidades nos cabeçalhos. Campos vazios são diferentes de zero; parcelas de tentativa não convergente ficam identificadas como diagnóstico. Veja [saídas, estados e rastreabilidade](EXPORTACAO-DE-RESULTADOS.md).

## Arquivos e recuperação

**Salvar** e Ctrl+S exportam `.geo.json`. No desktop, o primeiro salvamento pede destino e os seguintes atualizam o caminho selecionado. **Salvar como** escolhe um novo destino principal. No navegador, cada salvamento gera um download. Confira seu destino de downloads.

**Abrir** valida a estrutura antes de substituir o projeto atual; arquivo inválido não remove o trabalho aberto. Salve ou descarte alterações do projeto antes de substituí-lo. A recuperação local registra somente as operações aplicadas e é oferecida na tela inicial; nunca abre automaticamente. Ela não substitui o arquivo exportado e não contém campos/traçados ainda em edição.

O salvamento usa `geostruct/5`, incluindo os perfis numéricos aplicados por caso. Arquivos e recuperações das versões 1 a 4 são migrados mantendo materiais, referências, coordenadas e IDs. Casos antigos recebem perfil com campos pendentes, que precisam ser preenchidos antes de calcular. A abertura informa a migração e pede salvamento para persistir o novo formato; **Salvar como** permite conservar o original. Versões antigas do aplicativo não abrem arquivos v5. Campos desconhecidos ou referências inexistentes são recusados, sem descarte silencioso. Ausência de água/cargas antiga fica não definida, sem pressupor condição seca ou sem cargas. Nenhum caso é criado a partir de arquivos sem casos, e o círculo de tentativa continua preservado. Consulte [Casos de análise](CASOS-DE-ANALISE.md).

**Fechar projeto** retorna à tela inicial, protegendo alterações. Fechar normalmente remove sua recuperação local. Fechar a janela/browser sem resolver alterações exibe a proteção da plataforma. Bloqueio de armazenamento local é comunicado; salvar arquivo continua disponível.

## Preparar fatias e peso próprio

Selecione um caso com círculo fixo e abra **Geometria do círculo fixo** nas propriedades. Informe a tolerância geométrica e use **Preparar fatias**. Em **Inspecionar fatias**, consulte **Áreas por material** e **Pesos por fatia**. O peso próprio é a soma de γ total × área, em kN/m, por metro de largura fora do plano. Os painéis apresentam totais, composição e origem por material; a tabela geral mostra cada peso de fatia.

Se faltar γ, complete o material indicado e prepare novamente; as áreas continuam disponíveis durante a pendência. Rascunhos das propriedades do caso precisam ser aplicados ou descartados. Um perfil numérico inválido bloqueia **Calcular caso** e os métodos, mas **Preparar fatias** permanece disponível para diagnóstico geométrico. Alterações aplicadas nas entradas exigem nova preparação. As prévias ficam na sessão e não alteram o arquivo do projeto.

Abra **Pressões de água** para consultar u em kPa, ponto do arco, cotas, altura vertical e origem por fatia. O cálculo usa o γw informado na condição de água e a linha precisa cobrir todo o círculo. Na condição seca explícita, a pressão é zero e a linha guardada permanece inativa. γw ausente ou linha acima do terreno produzem diagnóstico, sem remover as áreas/pesos disponíveis. A entrada mecânica distingue a pressão física da usada na resistência.

Abra **Sobrecargas por fatia** para conferir totais por faixa, selecionar uma fatia e consultar cada trecho carregado, q, ponto X/Z, força e braço próprio. Q está em kN/m e o momento em kN·m/m. CCW positivo significa anti-horário no desenho X/Z; as colunas orientadas ao movimento seguem o sentido escolhido no caso. Sem sentido definido, essas colunas ficam pendentes e os valores CCW continuam disponíveis. Faixas sobrepostas são somadas; uma faixa fora da massa tem contribuição zero. q ausente em faixa contribuinte bloqueia as resultantes, preservando as outras inspeções. Zero informado continua identificado. Momentos opostos podem se anular sem eliminar a força. Veja [Sobrecargas nas fatias](SOBRECARGAS-NAS-FATIAS.md). Sem equilíbrio ou FS.

Abra **Entrada mecânica** para conferir a reunião das preparações. As fatias seguem a ordem do movimento e mantêm o número original do desenho. O referencial local tem origem no centro do círculo; α é positivo quando a base desce no movimento. Selecione uma fatia para consultar o material resistente da base, c/φ/modo e fonte, W/Q, pressão física u, pressão usada ue e resultantes U/Ue na corda. No modo total, somente ue/Ue são zero; u/U e o peso próprio continuam registrados. Valores nulos de c/φ/modo ou sentido ausente bloqueiam a consolidação, mantendo as outras inspeções. U usa pressão constante representada no ponto do arco e não é somado à carga vertical W + Q. A entrada mecânica ainda não calcula normal, tração, equilíbrio ou FS. Ver [contrato e casos independentes](ENTRADA-MECANICA-DAS-FATIAS.md).

## Fellenius no círculo fixo

Após **Preparar fatias**, localize **Fellenius · círculo fixo** nas propriedades. Selecione Fellenius nos métodos do caso e aplique a escolha. Preencha o limiar motriz τD em kN/m e a tolerância de tração τt em kPa. Campos vazios são pendências; zero informado usa corte estrito. Clique **Calcular Fellenius**.

O resultado apresenta FS do círculo ou o motivo de rejeição. Resistência nula nas bases aparece como FS = 0 destacado. Em **Inspecionar Fellenius**, consulte perfil, círculo/sentido, normal aproximada, tensão, parcelas de coesão/atrito e momentos de pesos/cargas. Valores negativos permanecem registrados. Alterar entradas, perfil, histórico, arquivo ou caso exige novo cálculo. Refinar a abertura angular permite comparar a sensibilidade.

Neste recorte, face vertical no intervalo da massa, modos resistentes mistos e água externa bloqueiam o método. Os resultados pertencem à sessão; salvar conserva as entradas e os perfis numéricos do projeto v5. Veja [regras e referências](FELLENIUS-CIRCULO-FIXO.md).

## Bishop Simplificado e comparação

Selecione Bishop Simplificado no caso, aplique e prepare as fatias. No painel **Bishop Simplificado · círculo fixo**, informe todos os campos: F₀ positivo, tolerância absoluta τF positiva, máximo K inteiro de 1 a 1.000 e os limiares não negativos τm, τD e τt. Clique **Calcular Bishop**, ou use **Calcular caso** para preparar e avaliar os métodos selecionados. Os parâmetros ficam registrados na inspeção e são salvos no perfil do caso.

**Inspecionar Bishop** mostra F avaliado, atualização G(F), resíduo, trajetória e parcelas por fatia. Sem convergência, com singularidade ou tração além do limite, o painel conserva o diagnóstico e não fornece FS válido. As tentativas da tabela não são resultados aprovados. Resistência física nula recebe diagnóstico próprio, sem iterar F = 0. Consulte [equações e limites](BISHOP-CIRCULO-FIXO.md).

Selecionando os dois métodos, calcule cada um nas mesmas fatias. **Comparar métodos** mostra os estados; ΔFS aparece quando ambos têm resultados positivos admissíveis e τD/τt coincidem. Alterar um perfil remove seu resultado e a diferença. Preparar outra discretização, editar dados ou trocar arquivo/caso exige novos cálculos. Compare também o refinamento angular antes de interpretar o valor.

## Buscar círculos na seção

1. Selecione **Busca circular** no caso, defina direção e métodos e aplique os limites de centro X/Z e raio. Use um eixo fixo quando quiser variar somente os outros.
2. Abra **Executar busca circular**. Informe tolerância geométrica, abertura máxima, τD, τt e a faixa de quase empate. Para Bishop, preencha também F₀, τF, K e τm. O painel mostra a contagem da malha e o limite de 10.000 círculos.
3. Use **Análise → Calcular caso** ou **Iniciar busca circular** e acompanhe a contagem de círculos avaliados. **Cancelar cálculo**, na Ribbon, ou **Cancelar busca**, nas propriedades, encerra a mesma execução e descarta a avaliação parcial.
4. Confira o menor FS admissível de cada método, os avisos de borda e os motivos de descarte em **Ver círculos avaliados**. A inspeção mostra a geometria, as parcelas por fatia e permite colocar as fatias no desenho.
5. Use **Conferir refinamento das fatias** na inspeção para testar uma abertura menor no mesmo círculo. Para conferir a resolução da malha, ajuste os passos do caso e execute outra busca com o mesmo perfil.

O resultado corresponde à malha avaliada com o perfil informado. Em seções com mais de uma face, delimite o domínio e confira o arco encontrado no desenho. Os [casos e limites da busca circular](BUSCA-CIRCULAR.md) descrevem a rejeição de candidatos, os empates e a resistência nula.

## Documentar

**Relatório de entradas** reúne todas as seções, materiais e fontes, coordenadas, água, cargas, círculo, casos e diagnósticos. Os casos registram condições resolvidas, lançamentos ativos, limites e dados guardados, sempre sem resultados de cálculo. Imprimir/PDF usa a impressão disponível no navegador/sistema. **Exportar HTML** fornece uma versão portátil. **Exportar desenho** salva SVG da vista atual; a extensão não contém o modelo editável completo, que pertence ao `.geo.json`.

A conferência detecta inconsistências de modelagem; os cálculos seguem os recortes documentados de Fellenius, Bishop Simplificado e busca circular. Não há comparação com critérios normativos de aceitação.

## Conferência integrada dos lançamentos

Em **Análise → Conferir modelo**, filtre por seção/caso e severidade. Cada caso inclui a geometria e os materiais compartilhados, além das condições efetivas de água/cargas do cenário. Materiais sem uso aparecem em um escopo próprio. Clique numa pendência para abrir o cadastro correspondente; rascunhos continuam protegidos. O relatório de entradas inclui a mesma conferência por escopo. Pendências compartilhadas aparecem em cada caso afetado, portanto as contagens não são somáveis como ocorrências únicas.

A conferência é derivada dos dados aplicados e não altera o formato v5 ou cria resultados. Ausência de pendências não comprova admissibilidade das superfícies nem estabilidade. Testes cobrem dependências compartilhadas, isolamento, condições próprias, ida/volta do arquivo, navegação e rascunhos. O salvamento recusa projetos acima de 8 MB para evitar produzir um arquivo que o leitor rejeitaria; o modelo aberto permanece disponível para edição.
