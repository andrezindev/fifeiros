# Extensão FIFEIROS

Lê o seu clube e os requisitos do DME aberto no Web App do EA FC, pede a solução
ao solver local e preenche a escalação do DME. Também exporta `club.json` e
`sbc.json` no formato do solver. Visão geral e instalação completa no
[README principal](../README.md).

**O que ela NÃO faz:** não envia DME, não compra, não vende. As únicas
requisições próprias são "Carregar clube inteiro" (repete a busca do clube do
Web App) e "Preencher no DME" (o mesmo "salvar escalação" do Web App).

## Instalar (modo desenvolvedor)

1. Abra `chrome://extensions` no Chrome.
2. Ligue o **Modo do desenvolvedor** (canto superior direito).
3. Clique em **Carregar sem compactação** e escolha esta pasta `extension`.
4. Fixe o ícone da extensão na barra (ícone de quebra-cabeça › alfinete).

Depois de alterar arquivos da extensão, clique em ⟳ no card dela em
`chrome://extensions` e **recarregue o Web App (F5)**.

## Usar

1. Abra o Web App e faça login normalmente.
2. **Clube:** vá em *Clube › Jogadores* **sem filtros** e deixe a primeira página carregar.
3. Abra os **Não atribuídos** e o **Armazém de DME**, se tiver.
4. No popup, clique em **Carregar clube inteiro**. A extensão repete a busca do
   clube página por página, com pausas de 2 a 4 segundos. Ela para sozinha se
   a EA recusar alguma requisição, e você pode parar a qualquer momento.
5. **DME:** abra o desafio desejado. O popup mostra os requisitos reconhecidos
   e avisa (⚠) o que não conseguiu traduzir.
6. Clique em **Exportar club.json** e **Exportar sbc.json** e rode o solver:
   ```powershell
   .\.venv\Scripts\python.exe -m sbc_solver --club "$HOME\Downloads\club.json" --sbc "$HOME\Downloads\sbc.json"
   ```

## Resolver o DME direto no Web App (Fase 3)

1. Dê dois cliques em **`iniciar-solver.bat`** (na pasta do projeto). Uma janela
   "Solver FIFEIROS" fica aberta; feche-a para parar.
2. No Web App, abra o DME. No popup da extensão, o ponto ao lado de "Solver"
   fica **verde** quando o solver está rodando.
3. Clique em **Resolver DME aberto**. A solução aparece num **painel flutuante**
   sobre o Web App (dá para arrastar, minimizar e fechar). O painel também tem
   um botão "Resolver", para refazer depois de mudar algo.
4. Monte o time no DME seguindo a lista e envie você mesmo.

No popup, em **Opções do solver** (ficam salvas):

| Opção | O que faz |
|---|---|
| Priorizar | Menor custo (padrão) · Menor overall primeiro · Proteger cartas boas |
| Faixa de overall | Barra dupla + campos mín./máx.: só usa jogadores nessa faixa |
| Substituir atletas já no DME | Ligado (padrão): o solver monta do zero. Desligado: mantém quem você já colocou e completa o resto |
| Somente não negociáveis | Não usa negociáveis do clube |
| Excluir atletas do elenco ativo | Não usa ninguém do seu time titular/reservas |
| Usar cartas de evento | Permite usar cartas especiais (protegidas por padrão) |
| Usar atletas de conceito | Em breve (precisa da lista do mercado) |

"Ignorar posição" não é necessário: o solver só considera posição quando o DME
pede química.

O clube e o DME vão só para o solver no **seu** PC (`127.0.0.1`). O solver
recusa pedidos de sites, só aceita os da extensão.

Depois de atualizar a extensão, recarregue-a (⟳ em `chrome://extensions`) e
aperte F5 no Web App.

## Preencher o time no DME (Fase 4)

No painel, depois de "Resolver", clique em **Preencher no DME**:

1. A extensão confere se a solução é do DME aberto, se todos os jogadores ainda
   estão no seu clube, se nenhum está em outro DME, se não há compras e se todos
   os requisitos foram entendidos. Se algo falhar, ela não preenche e explica o motivo.
2. Uma janela lista os jogadores e pede sua confirmação.
3. A extensão faz **uma** requisição, o mesmo "salvar escalação" que o Web App
   faz quando você coloca um jogador (`PUT .../sbs/challenge/{id}/squad`).
4. Em seguida a extensão coloca os mesmos jogadores na escalação que o Web App
   tem na memória (usando o próprio código do app) e redesenha o campo: o time
   aparece na hora, com química, overall e requisitos atualizados. Confira e
   aperte **Enviar** você mesmo.

Se essa atualização da tela falhar (por exemplo, depois de uma atualização da
EA), os jogadores continuam salvos na EA e o painel mostra o motivo e um botão
**Recarregar Web App agora**. Nesse caso, **não mexa no DME antes de
recarregar**: o app salvaria a cópia antiga dele por cima do time.

A extensão **nunca envia o DME**: o código só permite o endereço de "salvar
escalação" e há testes garantindo isso. Entre dois preenchimentos ela exige uma
espera de 8 segundos, e se a EA recusar, para e avisa.

## DMEs em sequência (Fase 5)

Depois que você aperta **Enviar** no Web App, a extensão detecta o envio (pela
resposta da EA ou pelo contador "vezes completado" do desafio) e **tira da
lista os jogadores usados**. O painel avisa; é só clicar em **Resolver** de novo
para o próximo, por exemplo um DME repetível várias vezes seguidas.

**Limite de ritmo** (só para as requisições da própria extensão): no mínimo 3 s
entre elas e no máximo 40 a cada 10 min. O carregador do clube pausa no limite
e continua sozinho; o "Preencher" avisa para esperar. O popup mostra o uso.

## Se algo não funcionar: diagnóstico

A EA não documenta o formato dos dados; a extensão segue o que a comunidade
mapeou. Se os números ficarem zerados, o DME não aparecer ou surgirem avisos ⚠:

1. Faça os passos acima (abra o clube, os não atribuídos e um DME).
2. Clique em **Exportar diagnóstico** e me envie o arquivo `fifeiros-diagnostico.json`.

O diagnóstico contém: a lista de endereços chamados pelo Web App (sem
parâmetros sensíveis), os nomes dos campos das respostas e poucas amostras de
jogadores/DMEs. **Não contém seu token de sessão, e-mail ou senha.**

## Privacidade e segurança

- O token de sessão da EA (`X-UT-SID`) fica só na memória da página, usado
  para repetir a busca do clube. Nunca é salvo nem exportado (há um teste
  automático garantindo isso).
- Os dados capturados ficam em `chrome.storage.local`, só neste computador.
  "Limpar dados" apaga tudo.
- A extensão só roda em `https://www.ea.com/*ultimate-team/web-app*`.

## Estrutura

```
manifest.json
src/page-hook.js        roda na página: escuta respostas da EA + carregador do clube
src/content.js          guarda os dados crus em chrome.storage.local
src/normalize/          converte dados da EA -> formato do solver (testado em Node)
src/popup/              interface
test/                   node --test "test/*.test.js"
tools/                  export-fixture.mjs (teste ponta a ponta), popup-preview.html
```

Testes: `cd extension` e `node --test "test/*.test.js"`.
