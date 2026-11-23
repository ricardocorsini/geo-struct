<h1 align="center">GeoStruct</h1>
<p align="center">Modelagem geotécnica 2D para taludes e contenções.<br/>Um aplicativo livre do <strong>OpenStruct</strong>.</p>

**GeoStruct — modelagem e evolução do núcleo 2D.** Crie seções, atribua materiais, represente água e sobrecargas e salve projetos locais. O GeoStruct 0.2.0 calcula Fellenius e Bishop Simplificado em círculo fixo e executa uma busca circular em malha de centros e raios. Os resultados incluem inspeção por fatia, diagnósticos e o menor FS admissível por método na malha avaliada.

## Começar

Node.js 22.12 ou superior (recomendado: Node 24):

```bash
git clone https://github.com/ricardocorsini/geo-struct.git
cd geo-struct
npm ci
npm run dev
```

Abra http://127.0.0.1:1420 e escolha **Abrir projeto padrão** para experimentar a análise. O comando também fica em **Arquivo → Projeto**. O talude demonstrativo tem duas camadas, linha piezométrica, sobrecarga de crista e casos para busca circular e círculo fixo. A busca abre selecionada, com perfil preenchido para Fellenius e Bishop Simplificado. Use **Iniciar busca circular** para avaliar os 27 círculos.

Para começar um modelo próprio, use **Novo projeto**. **Explorar um exemplo** abre o modelo de introdução à edição.

## Recursos desta versão

- Interface em português, ribbon, árvore de projeto, propriedades laterais, temas claro/escuro e painéis redimensionáveis.
- Projetos com múltiplas seções; criação e duplicação de seções e materiais compartilhados.
- Edição gráfica e por tabela: mover, inserir e excluir vértices, mover contornos, copiar e dividir regiões por uma reta.
- Importação CSV do contorno do terreno ou de uma região, com prévia, escolha de colunas/unidade e confirmação em uma operação de histórico. DXF/DWG continuam fora deste incremento.
- Interfaces coincidentes de solo acompanham a edição em uma única operação de desfazer/refazer, inclusive com subdivisões distintas nos contornos vizinhos.
- Captura de vértices, interseções e segmentos; grade configurável (inicialmente 0,5 m), restrição horizontal/vertical, pan e zoom no cursor.
- Entrada precisa por X/Z, deslocamento relativo ou distância/ângulo, além de medição de distância, desnível e ângulo.
- Perfil do terreno com faces verticais, base horizontal e regiões poligonais sem sobreposição, com material de fundo no restante do domínio. Perfis em balanço ainda não são admitidos.
- Gerenciador de materiais Mohr–Coulomb: peso específico total, coesão, atrito, escolha explícita de parâmetros efetivos/totais, origem e pendências de cadastro.
- Atribuição explícita de materiais às regiões e ao solo de fundo, individual ou em lote; duplicação, consulta de uso e substituição ao excluir um material compartilhado.
- Condição de água explícita: não definida, seca ou linha piezométrica prescrita, com peso específico e origem da hipótese.
- Gerenciador de sobrecargas verticais uniformes: intensidade pendente distinta de zero, origem, habilitação por faixa, duplicação e condições explícitas de presença/ausência de cargas.
- Alertas de cobertura e posição da água, faixas fora do terreno e sobreposição de cargas ativas; círculo geométrico de tentativa.
- Casos de análise vinculados à seção, com hipóteses, direção explícita, métodos pretendidos, água, seleção de faixas e perfil numérico próprios, preservados ao salvar e reabrir.
- Círculo fixo por coordenadas/desenho e limites/passos da busca circular; prévia das entradas, duplicação e exclusão com histórico.
- Validação geométrica, diagnósticos, desfazer/refazer, proteção de propriedades em edição e de alterações não salvas.
- Projeto `.geo.json` no formato `geostruct/5`, com leitura/migração dos arquivos das versões 1 a 4; cópia local de recuperação; importação inválida preserva o projeto aberto.
- Relatório de dados de entrada com impressão/PDF pelo navegador, HTML portátil e exportação SVG da vista atual.
- Estrutura desktop Tauri 2 com ícones padrão provisórios; a arte personalizada será incorporada em uma etapa posterior.

O modelo e a edição usam unidades SI: **m, kN e kPa**, ângulos em graus na entrada. A edição aceita ponto ou vírgula decimal. Não há backend, login ou chamadas remotas durante o uso do aplicativo.

Para importar coordenadas, selecione o terreno ou uma região e use **Importar CSV** nas propriedades. Escolha o arquivo, informe se há cabeçalho e sua unidade (m, cm ou mm), confira as colunas X/Z e a prévia em metros e confirme **Aplicar contorno**. O comando substitui somente o contorno selecionado e preserva seu ID e material, sem inferir vínculos com contornos vizinhos. Arquivos UTF-8 com BOM opcional, até 1 MiB e 500 pontos, aceitam separador `;`, vírgula ou tabulação e separador decimal explícito; vírgula não pode separar campos e decimais ao mesmo tempo. Os [exemplos CSV](examples/) são ilustrativos; veja o [passo a passo e as limitações](docs/GUIA-DE-USO.md#importar-coordenadas-csv). A importação mantém o formato atual `geostruct/5`, preservando também os perfis numéricos dos casos.

## Uso desktop

Instale Rust estável e os [pré-requisitos do Tauri 2](https://v2.tauri.app/start/prerequisites/). Em Ubuntu/Debian são necessárias as bibliotecas nativas WebKitGTK 4.1, GTK, AppIndicator e librsvg; Windows requer o ambiente MSVC e WebView2.

```bash
npm run desktop:dev
npm run desktop:build
```

Na primeira preparação desktop é necessário acesso à internet para baixar os ícones padrão do template oficial do Tauri. O script `npm run desktop:prepare` verifica a integridade dos arquivos e reutiliza a cópia local nas execuções seguintes. Os binários dos ícones não são versionados; o build web não depende desse download.

O aplicativo usa `br.com.openstruct.geostruct`, janela mínima de 960 × 640 e diálogo nativo de arquivos. O acesso ao sistema de arquivos fica limitado aos arquivos escolhidos pelo usuário. No navegador, Abrir usa o seletor de arquivo e Salvar gera um download. Conserve o arquivo exportado: a cópia de recuperação no navegador não substitui um backup.

A distribuição 0.2.0 usa o catálogo assinado do Struct Launcher. No Launcher, use **Verificar atualizações**, localize **GeoStruct** e escolha **Instalar** ou **Atualizar**. Os [pacotes oficiais](https://github.com/ricardocorsini/openstruct-catalog/releases/tag/geostruct-v0.2.0) incluem Windows x86_64 e Linux x86_64. Atualizações são gerenciadas pelo Launcher; não há autoatualizador dentro do GeoStruct.

## Desenvolvimento

```bash
npm run check
npm run build
npx playwright install --with-deps chromium
npm run test:e2e
npm run format:check
```

Testes de domínio verificam geometrias, limites dos parâmetros, arquivos, referências e histórico. Os testes de interface cobrem fluxos de edição e persistência. Os casos independentes de Fellenius e Bishop verificam o recorte documentado, sem substituir a validação integral de engenharia.

| Caminho           | Responsabilidade                                             |
| ----------------- | ------------------------------------------------------------ |
| `src/domain/`     | Modelo, validação geométrica e histórico, sem React ou Tauri |
| `src/core/`       | Preparações das fatias, Fellenius, Bishop e busca circular   |
| `src/components/` | Ribbon, navegador, editor gráfico, propriedades e relatório  |
| `src/lib/`        | Entrada e saída local, com adaptadores web e desktop         |
| `src-tauri/`      | Janela nativa, permissões, identidade e empacotamento        |
| `tests/`          | Testes de domínio e fluxos Playwright                        |
| `examples/`       | Exemplo próprio de modelagem                                 |
| `docs/`           | Guia, arquitetura, escopo e validação                        |

Consulte [Guia de uso](docs/GUIA-DE-USO.md), [Arquitetura](docs/ARQUITETURA.md), [Escopo e evolução](docs/ESCOPO-E-ROADMAP.md), [Validação](docs/VALIDACAO.md) e [histórico](CHANGELOG.md).

O [contrato de materiais e migração](docs/MATERIAIS-E-FORMATO.md) descreve os campos, limites de cadastro e compatibilidade dos arquivos. Novas seções e regiões começam sem material atribuído; essa pendência pode ser salva e resolvida depois.

O [contrato de água e cargas](docs/AGUA-E-CARGAS.md) descreve as condições, os lançamentos ativos/inativos e a migração para v3. Desativar preserva os dados; água ou cargas ausentes em um arquivo antigo ficam como não definidas.

O [contrato de casos de análise](docs/CASOS-DE-ANALISE.md) descreve a associação à seção, as condições próprias dos cenários e o formato v5. O perfil de cada caso guarda separadamente geometria, Fellenius, Bishop e busca, inclusive campos ainda pendentes. Os perfis ilustrativos do projeto padrão também são salvos. Os dois métodos podem ser executados em círculo fixo ou na busca circular.

Selecione um caso e abra **Entradas para o núcleo**, nas propriedades, para conferir os dados aplicados e suas pendências. O [contrato de entradas](docs/ENTRADAS-DO-NUCLEO.md) reúne condições efetivas, materiais usados, unidades e origem em uma cópia imutável, com revisão que detecta alterações posteriores.

Em **Geometria do círculo fixo**, informe a tolerância em metros e use **Preparar fatias**. A prévia mostra cortes, arco e tabela de áreas/comprimentos, com refinamento angular de até 3°. Alterações nas entradas ocultam a geometria anterior. O [contrato geométrico](docs/GEOMETRIA-DO-CIRCULO.md) documenta interseções, faces verticais, cortes obrigatórios, limitações e casos analíticos. O perfil aplicado fica no caso e no arquivo v5; a prévia fica na sessão. A preparação é independente da avaliação pelos métodos.

Na inspeção, abra **Áreas por material** para consultar os totais e a composição de uma fatia. As parcelas preservam suas regiões de origem e o solo de fundo, incluindo materiais acima da base. A soma é conferida contra a área até o arco, sem ajustes para forçar o fechamento. Consulte o [contrato das subáreas](docs/AREAS-POR-MATERIAL.md).

**Preparar fatias** também calcula o peso próprio como a soma de γ total × área de cada material, em kN/m. Abra **Pesos por fatia** para conferir áreas, γ, origem e parcelas. Um γ ausente bloqueia os pesos, preservando a inspeção geométrica; não há preenchimento automático. Água e sobrecargas não são adicionadas ao peso próprio. O [contrato de pesos](docs/PESOS-DAS-FATIAS.md) documenta o recorte aprovado de D2, as fontes e os casos independentes.

Em **Pressões de água**, confira `u = γw max(0, zp − zbase)` nos pontos médios angulares do arco, em kPa, com cotas, alturas e origem da interpolação. Condição seca explícita fornece zero. Linha ativa deve cobrir todo o candidato e γw precisa ser informado. Carga acima do terreno sinaliza a distinção ainda pendente entre água confinada e lâmina externa, mantendo geometria/pesos disponíveis. Veja [Pressões nas fatias](docs/PRESSOES-NAS-FATIAS.md). A pressão física é preservada ao preparar as parcelas para resistência na entrada mecânica.

Em **Sobrecargas por fatia**, confira `Q = q × L` no trecho horizontal carregado, seu ponto de aplicação no terreno e braço em relação ao círculo. A inspeção conserva IDs/origens, sobreposições e momentos positivos/negativos, com totais por faixa e por fatia. Intensidade ausente em faixa contribuinte bloqueia a preparação, sem assumir zero; momento nulo não elimina a força. Veja [Sobrecargas nas fatias](docs/SOBRECARGAS-NAS-FATIAS.md) para sinais, unidades e casos independentes. O cálculo usa o momento próprio de cada faixa.

Em **Entrada mecânica**, confira as fatias ordenadas no movimento, α da base, parâmetros e origem do material da base, W/Q e a distinção entre u/ue e U/Ue. A base usa a corda; `U = uℓ` é a resultante aproximada da pressão prescrita. O modo total zera ue/Ue sem apagar u/U. Sentido ou parâmetros resistentes ausentes bloqueiam apenas a consolidação, preservando as outras inspeções. Consulte [Entrada mecânica das fatias](docs/ENTRADA-MECANICA-DAS-FATIAS.md). O arquivo v5 guarda os dados de entrada e os perfis aplicados; resultados e prévias permanecem na sessão.

Em **Fellenius · círculo fixo**, informe o limiar motriz (kN/m) e a tolerância de tração (kPa), então use **Calcular Fellenius**. Consulte **Inspecionar Fellenius** para normal aproximada, parcelas resistentes, momentos e diagnósticos. O FS pertence ao círculo informado; não representa o mínimo de uma busca. Faces verticais na massa, bases com modos mistos e água externa ficam fora deste recorte. Veja [regras, equações e casos independentes](docs/FELLENIUS-CIRCULO-FIXO.md).

Em **Bishop Simplificado · círculo fixo**, informe F₀, tolerância do resíduo τF, máximo de avaliações K e limiares τm, τD e τt, então use **Calcular Bishop**. **Inspecionar Bishop** mostra cada tentativa, o resíduo no F avaliado, normais e parcelas por fatia. Singularidade, falta de convergência e tração além do limiar impedem apresentar um FS válido. Selecionando os dois métodos, a comparação mostra a diferença somente com resultados positivos admissíveis, nas mesmas fatias e com τD/τt iguais. Veja [regras, equações e casos independentes de Bishop](docs/BISHOP-CIRCULO-FIXO.md). Os parâmetros aplicados são salvos no caso; resultados e histórico de iterações ficam na sessão.

Para a **Busca circular**, aplique os limites e passos de centros X/Z e raios no caso. Abra **Executar busca circular**, preencha o perfil e confira a contagem de círculos. A execução em segundo plano permite cancelar. Os resultados mostram o menor FS positivo admissível por método, bordas, empates e descartes. **Ver círculos avaliados** reúne os diagnósticos e a inspeção permite desenhar as fatias e conferir o refinamento do círculo escolhido. Consulte as [regras e os casos de verificação da busca](docs/BUSCA-CIRCULAR.md).

## Origem e referências

Criado por **Ricardo Corsini**, no ecossistema **OpenStruct**. A base de pesquisa e especificação de estabilidade foi organizada pelo **Eng. Gustavo Azocar**, nas issues [#28](https://github.com/ricardocorsini/openstruct-front/issues/28), [#29](https://github.com/ricardocorsini/openstruct-front/issues/29), [#30](https://github.com/ricardocorsini/openstruct-front/issues/30) e [#31](https://github.com/ricardocorsini/openstruct-front/issues/31) do frontend.

A experiência segue convenções observadas nos aplicativos OpenStruct e na documentação oficial do Slide2 e GEO5. A implementação é própria. As referências e a situação do futuro motor estão em [ESCOPO-E-ROADMAP.md](docs/ESCOPO-E-ROADMAP.md).

Licença MIT. Dependências preservam suas licenças; veja [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Conferência integrada dos lançamentos

Em **Análise → Conferir modelo**, filtre por seção/caso e severidade. Cada caso inclui a geometria e os materiais compartilhados, além das condições efetivas de água/cargas do cenário. Materiais sem uso aparecem em um escopo próprio. Clique numa pendência para abrir o cadastro correspondente; rascunhos continuam protegidos. O relatório de entradas inclui a mesma conferência por escopo. Pendências compartilhadas aparecem em cada caso afetado, portanto as contagens não são somáveis como ocorrências únicas.

A conferência é derivada dos dados aplicados e não altera o formato v5 ou cria resultados. Ausência de pendências não comprova admissibilidade das superfícies nem estabilidade. Testes cobrem dependências compartilhadas, isolamento, condições próprias, ida/volta do arquivo, navegação e rascunhos. O salvamento recusa projetos acima de 8 MB para evitar produzir um arquivo que o leitor rejeitaria; o modelo aberto permanece disponível para edição.

## Distribuição desktop 0.2.0

O GeoStruct integra o catálogo assinado do Struct Launcher com NSIS para Windows e AppImage para Linux. Consulte [Desktop](docs/DESKTOP.md) para requisitos, limites de validação e cuidados com arquivos.
