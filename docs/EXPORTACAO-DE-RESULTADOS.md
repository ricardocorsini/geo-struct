# Memorial e CSV de resultados

Em **Resultados**, selecione o caso, a superfície e o método e abra **Memorial de resultados**. O comando usa a execução e a inspeção apresentadas nessa aba, sem calcular outro caso ou alterar o projeto.

## Saídas

- **Imprimir / PDF** usa a impressão da plataforma. No navegador, escolha o destino PDF para gravar uma cópia. O conteúdo inclui identificação, perfil, círculo, métodos, FS, discretização, diagnósticos, parcelas por fatia e, na busca, cobertura da malha e mínimos por método.
- **Exportar HTML** gera um documento portátil em português, com estilos locais, entrada aplicada e perfil efetivo. Não precisa de servidor, CDN ou acesso à rede para consultar o arquivo exportado.
- **Exportar candidatos CSV**, nos casos de busca, inclui todos os candidatos e uma linha por método solicitado. O estado e o diagnóstico permanecem disponíveis mesmo quando a geometria ou o método são rejeitados.
- **Exportar fatias CSV** inclui todas as fatias da superfície e do método selecionados, conservando a numeração original e a ordem do movimento quando disponível. A fatia destacada na tela não restringe esse arquivo. Geometria bloqueada não produz fatias inventadas.

No navegador os arquivos são downloads. No desktop, o adaptador existente pede o destino por diálogo nativo. Cancelar o salvamento não modifica o projeto nem significa exportação concluída. O HTML/PDF é independente do `.geo.json`: os resultados continuam pertencendo à sessão e não mudam o formato `geostruct/5`.

## Atualidade e estados

Só uma execução concluída, vinculada às entradas e ao perfil vigentes, pode gerar um memorial identificado como **Resultado atual**. A inspeção da superfície também precisa estar concluída e corresponder ao candidato selecionado. Durante sua preparação, aguarde o comando ficar disponível.

Uma alteração relevante, perfil pendente ou rascunho deixa o resultado desatualizado. O memorial apresenta a pendência, retira o artigo anterior e bloqueia HTML, CSV e impressão de resultados. Aplique ou descarte o rascunho e calcule o caso quando necessário. Restaurar exatamente uma identidade ainda retida na sessão pode recuperar o resultado correspondente sem recálculo. Um cálculo cancelado não exporta o parcial.

Abrir o memorial ou o **Relatório de entradas** é uma consulta: não descarta propriedades em edição. O relatório de entradas permanece disponível e inclui somente dados aplicados, sem resultados ou valores do rascunho.

| Estado do método no CSV | Interpretação do FS                                                             |
| ----------------------- | ------------------------------------------------------------------------------- |
| `calculated`            | FS positivo admissível no recorte do método.                                    |
| `zero-resistance`       | Resistência nula; Fellenius conserva FS `0`, enquanto Bishop conserva FS vazio. |
| `nonconverged`          | Bishop não convergiu; FS vazio. Última tentativa não é uma solução.             |
| `rejected`              | Resultado rejeitado; FS vazio e diagnóstico preservado.                         |
| `not-evaluated`         | Método solicitado não foi avaliado, por exemplo por bloqueio da preparação.     |

O memorial distingue a comparação entre métodos **na mesma superfície** dos **mínimos da malha por método**. Mínimos amostrados não garantem o mínimo global; bordas, quase empates e descartes precisam ser considerados na interpretação. FS é apresentado com três casas no memorial; os CSVs conservam a precisão numérica disponível.

## Rastreabilidade

O contrato da exportação é `geostruct-result-export/1`, independente do formato de projeto. O documento identifica projeto, seção, caso, aplicativo, contratos e formulações do motor, círculo, método e perfil efetivo. **Gerado em** indica a geração do documento, não a data de execução do solver, que não é registrada pela sessão.

O memorial inclui a entrada original aplicada e o perfil completos. Há três identificadores SHA-256, calculados com WebCrypto sobre os bytes UTF-8 exatos das strings já usadas pela execução:

1. `inputRevision`: serialização da entrada original do caso.
2. `identityKey`: identidade que reúne projeto, caso, revisão e perfil efetivo.
3. `surfaceRevision`: entrada do círculo inspecionado. Na busca, é a derivação da entrada original para aquele círculo fixo; não é a revisão original da busca.

Esses hashes identificam o conteúdo, sem representar assinatura, aprovação ou garantia de autenticidade. As tabelas repetem IDs, hashes, perfil e contratos em cada linha, evitando associar valores a metadados presentes somente na primeira linha. Não repetem a entrada JSON completa em cada fatia/candidato; conserve também o memorial HTML para consultar essa entrada.

## Convenção CSV

UTF-8 com BOM, separador **ponto e vírgula**, decimal **vírgula**, sem separador de milhar e linhas CRLF. Textos usam aspas duplas e duplicam aspas internas; quebras internas são preservadas. Configure esses parâmetros ao importar em uma planilha, se a detecção automática não separar as colunas corretamente.

- Cabeçalhos identificam a grandeza e a unidade: `W_kN_por_m`, `u_kPa`, `area_m2`, `alfa_rad`, entre outros.
- `candidato_id` é o número original da malha, ou `fixo`; `fatia_id` conserva a numeração original da geometria. `metodo` distingue `fellenius` e `bishop`.
- Campos indisponíveis ficam vazios. Zero é um valor numérico, não ausência. Números não finitos ou linhas com colunas inconsistentes são recusados.
- `parcelas_diagnosticas=sim` informa que as parcelas disponíveis não pertencem a um resultado positivo admissível. Elas podem incluir a última avaliação completa de Bishop, sem preencher FS quando não houve convergência.
- `diagnosticos` conserva etapa, código, nível, mensagem e identificação de fatia quando disponível. Na tabela de candidatos, `avaliacoes_Bishop` e `residuo_Bishop` documentam a convergência.
- Textos que poderiam iniciar fórmulas recebem um apóstrofo de proteção, inclusive IDs ou nomes iniciados por `=`, `+`, `-` ou `@`. Números negativos tipados continuam numéricos. Essa proteção pode aparecer ao ler o CSV como texto.

As unidades são as do modelo: m, kN, kPa e grandezas por metro fora do plano. A exportação não introduz equações, tolerâncias físicas ou aprovação normativa. Impressão e salvamento nativos precisam de conferência própria no Windows/WebView2 e Linux/WebKitGTK, além dos testes web.
