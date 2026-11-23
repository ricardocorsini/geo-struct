# Histórico

## Em desenvolvimento

### Importação CSV de contornos

- Importação CSV para o terreno ou uma região, com prévia em metros, cabeçalho, colunas e unidade m/cm/mm explícitos.
- Separadores configuráveis, campos entre aspas, limites de arquivo/pontos e validação de contorno, domínio e sobreposição antes da aplicação.
- Substituição isolada em uma operação de histórico, preservando IDs, material, demais elementos e seções, com proteção de rascunhos e cancelamento sem alterar o projeto.
- Exemplos próprios e testes de leitura/interface. A importação não altera o formato de projeto; integrada ao perfil por caso, conserva `geostruct/5`. DXF/DWG permanecem pendentes na issue #9.

### Perfil de cálculo por caso

- Formato `geostruct/5` com `numericalProfile` por caso. Geometria, Fellenius, Bishop e busca conservam suas configurações ao salvar, reabrir, alternar modos/métodos, duplicar e desfazer/refazer.
- Perfis parciais guardam campos nulos como pendências explícitas. Rascunhos inválidos permanecem protegidos na interface. Resultados e prévias continuam na sessão.
- Leitura de v1 a v4 com validação do contrato original antes da migração. Casos de v4 recebem perfil vazio, conservando a abertura de 3° já usada pela preparação geométrica; os demais parâmetros precisam ser informados.
- Os perfis ilustrativos preenchidos do projeto padrão passam a integrar o arquivo salvo.

## 0.2.0 — 2026-11-18

Primeira distribuição desktop com análise circular de taludes. Instale ou atualize pelo Struct Launcher. Os arquivos de projeto continuam no formato `geostruct/4`.

### Projeto padrão de estabilidade

- **Abrir projeto padrão** na tela inicial e na aba **Arquivo**, com proteção para o projeto em edição.
- Talude de duas camadas com água, sobrecarga e casos de busca circular e círculo fixo. Perfis ilustrativos preenchidos na sessão para os dois métodos.

### Busca circular determinística

- Malha de centros X/Z e raios na ordem dos índices, com contagem prévia e capacidade de até 10.000 círculos.
- Busca em segundo plano com progresso e cancelamento. Menor FS admissível por método, bordas, empates, resistência nula e motivos de descarte.
- Inspeção de candidatos, desenho das fatias e conferência com abertura angular menor. Perfil e resultados vinculados ao caso aplicado durante a sessão.

### Bishop Simplificado em círculo fixo

- Iteração com F₀, τF, K, τm, τD e τt explícitos; histórico e resíduo no F avaliado. Sem amortecimento ou substituição silenciosa do perfil.
- Inspeção de parcelas, normais, momentos próprios das faixas e diagnósticos de singularidade, falta de convergência, tração e resistência nula. Tentativas rejeitadas não fornecem FS.
- Comparação com Fellenius para a mesma entrada e fatias, com limiares comuns iguais e resultados admissíveis. Invalidação por perfil, dados, histórico, arquivo e caso.
- Caso analítico, dez fatias de referência, refinamento/invariâncias e fluxos de interface. Resultados vinculados ao perfil e à revisão da entrada.

### Fellenius em círculo fixo

- Método de referência com pressão neutra projetada (D1/USACE C-12), normal aproximada, resistência do material da base e momentos próprios das sobrecargas. FS somente para o círculo informado.
- Perfil explícito de limiar motriz/tração, somas compensadas e diagnósticos de finitude, cancelamento, tração e resistência nula. Face vertical no intervalo e modos mistos bloqueiam o recorte.
- Cálculo por ação explícita e inspeção das parcelas por fatia, com invalidação por edição, perfil, caso, histórico e arquivo. Textos do aplicativo passam a distinguir cadastro, preparação e cálculo.
- Casos analíticos, reprodução de nove fatias de referência e fluxos de interface. Verificação do método nas superfícies fixas de referência.

### Entrada mecânica das fatias

- Consolidação de geometria, pesos, pressões e sobrecargas da mesma revisão/perfil em `geostruct-slice-mechanics/1`, com ordenação no sentido do movimento e identificação geométrica original preservada.
- Corda da base, α positivo na descida, coordenadas locais no centro do círculo e braço aproximado do peso. Sobrecargas conservam seus braços próprios.
- Resistência fornecida pelo material da base, com c/φ/modo explícitos. Pressão física u e resultante aproximada U = uℓ separadas de ue/Ue destinados à resistência; modo total não apaga a pressão física nem muda o peso próprio.
- Inspeção integrada por fatia, diagnósticos sem resultado parcial e testes independentes de sinais, unidades, modos, referência, perfil, arquivo e histórico. A entrada mecânica reúne as parcelas usadas pelos métodos.

### Resultantes das sobrecargas

- Recorte de D3: forças verticais por largura horizontal carregada, pontos no terreno e braços próprios em relação ao círculo. Momentos com sinal CCW e orientados ao movimento, sem confundir força nula com momento nulo.
- Inspeção por faixa/fatia com IDs, origens, intervalos, intensidades e totais; sobreposições aditivas, carga zero distinta de q ausente e faixas sem contribuição identificadas.
- Contrato imutável `geostruct-slice-loads/1`, mesma revisão/perfil da geometria. Falhas bloqueiam sobrecargas sem remover pesos/pressões; sentido ausente mantém momento CCW e deixa orientação pendente.
- Integração analítica independente, conservação com refinamento, escala, translação e espelhamento, sinais/cancelamento, arquivo, rascunhos e histórico. Registro do braço de cada faixa na inspeção das fatias.

### Pressões de água nas bases

- Preparação de `u = γw max(0, zp − zbase)` em kPa, no ponto médio angular do arco, com condição seca explícita e pressão zero na linha/acima dela.
- Conferência de cobertura de todo o candidato, sem extrapolar; γw ausente e carga acima do terreno produzem diagnósticos. A distinção entre água confinada/lâmina externa permanece fora deste recorte.
- Inspeção por fatia com cotas, altura vertical, γw, condição/origem e segmento da linha; pressões independentes dos pesos e do modo de resistência. Rascunhos, revisão, histórico e arquivo v4 preservados.
- Cálculo das interseções pela normal à reta evita cancelamento entre extremo e projeção, corrigindo uma falsa proximidade entre o nó de água e a extremidade do candidato. Mesma geometria/contrato, com regressão para segmentos longos e cobertura nas extremidades.
- Casos analíticos, integridade e fluxos de interface. Sem forças de água, equilíbrio ou FS.

### Peso próprio das fatias

- Preparação de `Wi = Σ γj Aij`, em kN/m, pelo peso específico total informado de cada material; recorte de D2 documentado com fontes e casos independentes.
- Inspeção dos pesos por fatia/material, áreas, γ e origem das parcelas, incluindo materiais acima da base. Peso próprio na tabela geral e total no inspetor.
- γ ausente bloqueia somente os pesos; áreas continuam disponíveis. Sem inferir propriedades, aplicar redução por água ou somar sobrecargas ao peso próprio.
- Contrato independente e imutável `geostruct-slice-weights/1`, vinculado à revisão/perfil; rascunhos, edição, desfazer/refazer e formato v4 preservados. Testes aritméticos, analíticos e de interface. Sem equilíbrio ou FS.

### áreas por material

- Partição geométrica das fatias por material, com integração até o arco, regiões côncavas, inclusões acima da base e fundo integrado nos intervalos livres.
- Totais por material e parcelas por origem, conferência de conservação por fatia e global, sem corrigir resíduos ou inferir pesos.
- Inspeção dos totais e da fatia selecionada; atribuições ausentes em parcelas positivas impedem a preparação. Histórico, revisão e formato v4 preservados.
- Reaproveitamento das raízes de interfaces coincidentes com subdivisões diferentes, sem juntar interfaces apenas próximas. Contrato geométrico 2 e casos analíticos de áreas.

### Geometria do círculo fixo

- Preparação independente de interseções e fatias no arco inferior, com tolerância explícita, cortes rastreáveis e refinamento angular de até 3°.
- Áreas geométricas até o arco, comprimentos de arco/corda, cotas unilaterais em faces verticais e identificação do material na base, sem forças ou FS.
- Prévia no desenho e tabela de inspeção; alterações de entradas/perfil ocultam a prévia anterior. Rascunhos, histórico e formato v4 preservados.
- Contrato geométrico documentado, casos analíticos e testes de diagnóstico/integridade/interface. A revisão integral das regras mecânicas continua pendente.

### Entradas do núcleo

- Contrato independente `geostruct-input/1` e adaptador dos casos existentes, com unidades, origem, coordenadas X/Z e condições efetivas.
- Cópia imutável e revisão determinística para detectar alterações nos dados compartilhados, no caso e após desfazer/refazer.
- Conferência **Entradas para o núcleo** nas propriedades do caso, respeitando rascunhos e reutilizando os diagnósticos do cadastro.
- Testes de integridade, isolamento, herança, nulos/zeros, revisão e interface. O contrato conserva o formato de projeto v4.

## 0.1.0 — primeira distribuição desktop

- NSIS por usuário para Windows e AppImage para Linux, pelo catálogo assinado do Struct Launcher.
- Testes de adaptadores de arquivos, compilação e abertura de janela nativa em ambos os sistemas. Homologação manual completa ainda pendente.
- Ícones padrão provisórios, notas versionadas e vínculo entre tag e commit de origem.
- Versão de modelagem: sem fator de segurança, verificação de admissibilidade ou dimensionamento.

## Em desenvolvimento — conferência integrada

- Conferência por seção/caso, filtros, dependências compartilhadas e navegação aos cadastros. Relatório com o mesmo diagnóstico por escopo.
- Salvamento recusa arquivos acima do limite de leitura (8 MB), preservando o modelo aberto.
- Testes de isolamento, condições próprias, persistência, rascunhos e janela mínima. Sem alteração de formato ou motor de cálculo.

## Em desenvolvimento — casos de análise

- Casos com identidade própria vinculados à seção, hipóteses, direção de deslizamento e métodos pretendidos.
- Condições de água/cargas herdadas ou próprias, seleção explícita de faixas e prévia das entradas do cenário.
- Círculo fixo por desenho/coordenadas ou cópia explícita do círculo de tentativa; limites e passos de busca circular, sem gerar candidatos.
- Gerenciador, duplicação/exclusão, relatório e diagnósticos. Duplicar seção remapeia as referências dos casos; excluir seção trata seus casos na mesma operação.
- Proteção de faixas referenciadas, rascunhos e histórico; formato `geostruct/4`, migrando v1/v2/v3 sem criar casos presumidos.

Próximo passo: conferência completa do lançamento e revisão de usabilidade/arquivos antes da distribuição desktop. Sem solver nesta entrega.

## Em desenvolvimento — água e sobrecargas

- Condições explícitas de água e presença de sobrecargas por seção; ausência de lançamento distinta de hipótese adotada.
- Peso específico e origem da condição de água; alertas de cobertura e posição da linha piezométrica.
- Sobrecargas com q inicialmente não informado, origem, habilitação, cópia desabilitada e exclusão com histórico.
- Gerenciador com intervalos sobrepostos e rejeição de reativação fora do terreno; dados inativos preservados no cadastro/relatório.
- Formato `geostruct/3`, leitura de v1/v2 preservando valores e IDs, inclusive q = 0, e recuperação local compatível.
- Testes de condições, migração, edição, persistência, histórico e isolamento entre seções.

Esta etapa de água/cargas não adicionou solver ou distribuição de instaladores.

## Em desenvolvimento — materiais e atribuição

- Gerenciador de materiais com pendências de cadastro e consulta de uso em todas as seções.
- Novas regiões e solos de fundo sem atribuição automática; escolha individual ou em lote, com retirada explícita de vínculo.
- Tipo de parâmetros efetivos/totais inicialmente não definido, rótulos c′/φ′ e c/φ, valores nulos distintos de zero e erros de cadastro em português.
- Duplicação independente e substituição de todas as atribuições ao excluir material em uso, em uma operação de histórico.
- Formato `geostruct/2`: referências e tipo de parâmetros podem ser nulos; zero materiais é permitido. Leitura/migração de v1 preserva dados e IDs; campos desconhecidos são recusados.
- Relatório, árvore e desenho identificam atribuições pendentes. Testes de domínio/interface incluem arquivos e recuperação antigos.

Esta etapa de materiais não adicionou cálculo ou distribuição desktop.

## Em desenvolvimento — geometria e edição

- Inserir/excluir vértices, mover contornos, copiar e dividir regiões por reta.
- Edição de interfaces coincidentes com propagação aos contornos vizinhos, inclusive pela tabela, e histórico por operação.
- Captura de vértices/interseções/segmentos, grade configurável e restrição horizontal/vertical.
- Entrada absoluta, relativa e por distância/ângulo; medição sem modificar o projeto.
- Faces verticais no terreno, com rejeição de retorno, balanço e trechos sem área nas extremidades.
- Compatibilidade com arquivos `geostruct/1`, testes de geometria/precisão e fluxos de interface.

Esta evolução não publica instaladores, não adiciona solver e mantém a arte personalizada adiada.

## 0.1.0 — 2026-11-17

Primeira entrega de código: modelagem geotécnica 2D.

- Interface OpenStruct em português, ribbon, árvore de projeto, propriedades, temas e painéis redimensionáveis.
- Múltiplas seções, materiais compartilhados, terreno, regiões de solo, linha piezométrica, faixas de carga e círculo de tentativa.
- Desenho gráfico, tabela/colagem de coordenadas, arraste de vértices, captura, pan/zoom e histórico por operação.
- Validação de contornos, sobreposição, cobertura, propriedades e contrato de arquivo.
- Projetos `.geo.json`, recuperação local e proteção de rascunhos/alterações não salvas.
- Relatório de entradas com impressão e HTML; desenho SVG.
- Estrutura Tauri 2 para Linux/Windows com ícones padrão provisórios, documentação e CI.

O solver de estabilidade e o dimensionamento de contenções ainda não fazem parte desta versão. Instaladores, catálogo e atualização pelo Launcher serão tratados em etapa posterior.
