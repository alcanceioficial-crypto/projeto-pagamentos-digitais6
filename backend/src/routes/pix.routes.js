const express = require("express");
const router = express.Router();

const { criarPix, consultarPixPorTxid } = require("../services/efiPix.service");
const { salvarPedido } = require("../services/pedidoStore.service");

/* ======================================================
   PREÇOS DOS PRODUTOS (mesma ordem do HTML)
====================================================== */
const PRECOS = {
  "Conjunto Colar P LT 01 233": 162.00,
  "Conjunto Oval Zircônia — Ref. LT 09 006": 162.00,
  "Brinco Trio Gota/Zircônia P — Ref. LT 09 018": 151.00
};

const DESCRICAO_PRODUTO = "Sandra Maria Semi-Jóias";

/* ======================================================
   MAPEAMENTO DE VENDEDORAS
====================================================== */
const VENDEDORAS = {
  "CR001": { nome: "Camila Rossi" },
  "SR001": { nome: "Sandra Rossi" },
  "NT001": { nome: "Nayara Turatti" }
};

/* ======================================================
   GERAR PIX
====================================================== */
router.post("/gerar_pix", async (req, res) => {
  try {
    const { itens, nome, whatsapp, endereco, vendedoraId, frete } = req.body;

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: "Nenhum item enviado" });
    }

    if (!nome || !whatsapp || !endereco) {
      return res.status(400).json({ erro: "Dados do cliente incompletos" });
    }

    let subtotal = 0;
    let totalPecas = 0;

    for (const item of itens) {
      const qtd = parseInt(item.quantidade, 10);
      if (!qtd || qtd < 1 || qtd > 50) {
        return res.status(400).json({ erro: "Quantidade inválida" });
      }

      const preco = PRECOS[item.produto];
      if (!preco) {
        return res.status(400).json({ erro: `Produto desconhecido: ${item.produto}` });
      }

      subtotal += preco * qtd;
      totalPecas += qtd;
    }

    subtotal = Number(subtotal.toFixed(2));

    // ✅ Valor do frete (vem do frontend após cálculo pela Frenet)
    const valorFrete = frete && frete.preco ? Number(frete.preco) : 0;

    const total = Number((subtotal + valorFrete).toFixed(2));

    if (total < 1) {
      return res.status(400).json({ erro: "Valor mínimo não atingido" });
    }

    const descricao = `${DESCRICAO_PRODUTO} (${totalPecas} ${
      totalPecas === 1 ? "peça" : "peças"
    }) - ${nome}`;

    const pix = await criarPix(total, descricao);

    // Descobre o nome da vendedora (se houver)
    const vendedoraNome = vendedoraId && VENDEDORAS[vendedoraId]
      ? VENDEDORAS[vendedoraId].nome
      : null;

    // 💾 SALVA O PEDIDO EM MEMÓRIA (com frete)
    salvarPedido(pix.txid, {
      nome,
      whatsapp,
      endereco,
      itens: itens.map(i => ({
        tipo: i.produto,
        quantidade: i.quantidade,
        preco: PRECOS[i.produto]
      })),
      subtotal,
      frete: frete ? {
        transportadora: frete.transportadora,
        servico: frete.servico,
        preco: valorFrete,
        prazo: frete.prazo
      } : null,
      total,
      metodoPagamento: "pix",
      vendedoraId: vendedoraId || null,
      vendedoraNome
    });

    console.log(
      `🧾 PIX GERADO | txid: ${pix.txid} | subtotal: R$ ${subtotal} | frete: R$ ${valorFrete} | total: R$ ${total}` +
      (vendedoraId ? ` | vendedora: ${vendedoraId}` : "")
    );

    res.json({
      txid: pix.txid,
      pix: pix.pixCopiaECola,
      valor: total,
      subtotal,
      frete: valorFrete,
      totalPecas
    });

  } catch (err) {
    console.error("❌ Erro ao gerar PIX:", err.message);
    res.status(500).json({ erro: "Erro ao gerar PIX" });
  }
});

/* ======================================================
   STATUS DO PIX
====================================================== */
router.get("/status_pix", async (req, res) => {
  try {
    const { txid } = req.query;
    if (!txid) return res.status(400).json({ erro: "TXID não informado" });

    const pix = await consultarPixPorTxid(txid);

    if (pix.status === "CONCLUIDA") {
      return res.json({ status: "CONCLUIDA" });
    }
    return res.json({ status: "PENDENTE" });

  } catch (err) {
    console.error("❌ Erro ao consultar status:", err.message);
    res.status(500).json({ erro: "Erro ao consultar status" });
  }
});

module.exports = router;
