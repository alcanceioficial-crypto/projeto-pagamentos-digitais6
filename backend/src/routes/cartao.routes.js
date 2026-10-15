
const express = require("express");
const router = express.Router();

const {
  criarCobrancaCartao,
  pagarCobrancaCartao,
  consultarCobrancaCartao,
} = require("../services/efiCartao.service");

const { salvarPedido, buscarPedido, removerPedido } = require("../services/pedidoStore.service");
const { enviarEmailPedido } = require("../services/email.service");

/* ======================================================
   PREÇOS DOS PRODUTOS
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
   LIMPA TELEFONE
====================================================== */
function limparTelefone(tel) {
  let nums = (tel || "").replace(/\D/g, "");
  if (nums.startsWith("55") && nums.length > 11) nums = nums.slice(2);
  if (nums.length > 11) nums = nums.slice(-11);
  while (nums.length < 10) nums = "0" + nums;
  return nums;
}

/* ======================================================
   GERAR PAGAMENTO CARTÃO
====================================================== */
router.post("/gerar_pagamento", async (req, res) => {
  try {
    const {
      itens,
      nome,
      whatsapp,
      endereco,
      vendedoraId,
      frete,
      payment_token,
      dadosCartao,
    } = req.body;

    if (!Array.isArray(itens) || itens.length === 0) {
      return res.status(400).json({ erro: "Nenhum item enviado" });
    }

    if (!nome || !whatsapp || !endereco) {
      return res.status(400).json({ erro: "Dados do cliente incompletos" });
    }

    if (!payment_token) {
      return res.status(400).json({ erro: "Token do cartão ausente" });
    }

    if (!dadosCartao || !dadosCartao.nomeTitular || !dadosCartao.cpfTitular) {
      return res.status(400).json({ erro: "Dados do titular incompletos" });
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

    // ✅ Valor do frete
    const valorFrete = frete && frete.preco ? Number(frete.preco) : 0;
    const total = Number((subtotal + valorFrete).toFixed(2));

    if (total < 0.01) {
      return res.status(400).json({ erro: "Valor mínimo não atingido" });
    }

    const descricao = `${DESCRICAO_PRODUTO} (${totalPecas} ${
      totalPecas === 1 ? "peça" : "peças"
    }) - ${nome} - ${Date.now()}`;

    const telefoneLimpo = limparTelefone(whatsapp);

    console.log(`💳 Iniciando cobrança cartão | subtotal: R$ ${subtotal} | frete: R$ ${valorFrete} | total: R$ ${total}`);

    const cobranca = await criarCobrancaCartao({
      valor: total,
      descricao,
      nome,
      cpf: dadosCartao.cpfTitular,
      email: dadosCartao.email,
      telefone: telefoneLimpo,
    });

    console.log(`💳 Cobrança criada | charge_id: ${cobranca.chargeId}`);

    const vendedoraNome = vendedoraId && VENDEDORAS[vendedoraId]
      ? VENDEDORAS[vendedoraId].nome
      : null;

    const pedido = {
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
      metodoPagamento: "cartao",
      vendedoraId: vendedoraId || null,
      vendedoraNome
    };

    salvarPedido(cobranca.chargeId, pedido);

    const pagamento = await pagarCobrancaCartao(
      cobranca.chargeId,
      payment_token,
      {
        ...dadosCartao,
        rua: endereco.rua,
        numero: endereco.numero,
        bairro: endereco.bairro,
        cep: endereco.cep,
        cidade: endereco.cidade,
        estado: endereco.estado,
        complemento: endereco.complemento,
        telefone: telefoneLimpo,
      }
    );

    console.log(`💳 Pagamento processado | charge_id: ${cobranca.chargeId}`);
    console.log(`💳 Resposta pagamento:`, JSON.stringify(pagamento));

    const statusPagamento =
      pagamento?.data?.status ||
      pagamento?.status ||
      "unknown";

    if (statusPagamento === "paid" || statusPagamento === "approved") {
      console.log(`✅ CARTÃO PAGO (${statusPagamento}) — enviando e-mail...`);
      try {
        await enviarEmailPedido(pedido, cobranca.chargeId);
        removerPedido(cobranca.chargeId);
        console.log(`📧 E-mail enviado e pedido removido da memória`);
      } catch (emailErr) {
        console.error("⚠️ Erro ao enviar e-mail:", emailErr.message);
      }
    } else {
      console.log(`⏳ Pagamento com status "${statusPagamento}" — aguardando`);
    }

    res.json({
      chargeId: cobranca.chargeId,
      status: statusPagamento,
      valor: total,
      subtotal,
      frete: valorFrete,
      totalPecas,
      metodo: "cartao",
      mensagem:
        (statusPagamento === "paid" || statusPagamento === "approved")
          ? "Pagamento aprovado!"
          : "Pagamento em processamento.",
    });

  } catch (err) {
    console.error("❌ Erro ao gerar pagamento cartão:", err.message);
    if (err.response) {
      console.error("   Status:", err.response.status);
      console.error("   Body:", JSON.stringify(err.response.data, null, 2));
    }
    res.status(500).json({
      erro: "Erro ao processar pagamento com cartão",
      detalhe: err.response?.data || err.message,
    });
  }
});

/* ======================================================
   STATUS DA COBRANÇA (polling)
====================================================== */
router.get("/status_cartao", async (req, res) => {
  try {
    const { chargeId } = req.query;
    if (!chargeId) return res.status(400).json({ erro: "chargeId não informado" });

    const cobranca = await consultarCobrancaCartao(chargeId);
    const status = cobranca.data?.status || cobranca.status;
    console.log(`🔍 Consulta cartão ${chargeId}: ${status}`);

    if (status === "paid" || status === "approved") {
      const pedido = buscarPedido(chargeId);
      if (pedido) {
        console.log(`✅ Polling detectou pagamento (${status}) — enviando e-mail`);
        try {
          await enviarEmailPedido(pedido, chargeId);
          removerPedido(chargeId);
          console.log(`📧 E-mail enviado via polling`);
        } catch (emailErr) {
          console.error("⚠️ Erro ao enviar e-mail via polling:", emailErr.message);
        }
      }
      return res.json({ status: "CONCLUIDA" });
    }
    return res.json({ status: "PENDENTE" });

  } catch (err) {
    console.error("❌ Erro ao consultar cobrança cartão:", err.message);
    res.status(500).json({ erro: "Erro ao consultar cobrança" });
  }
});

module.exports = router;
