const express = require("express");
const router = express.Router();

const { calcularFrete } = require("../services/frenet.service");

/* ======================================================
   CALCULAR FRETE
====================================================== */
router.post("/calcular", async (req, res) => {
  try {
    const { cep, valorPedido } = req.body;

    if (!cep) {
      return res.status(400).json({ erro: "CEP não informado" });
    }

    const opcoes = await calcularFrete(cep, valorPedido || 0);

    if (opcoes.length === 0) {
      return res.status(200).json({
        opcoes: [],
        mensagem: "Nenhuma opção de frete disponível para este CEP"
      });
    }

    res.json({ opcoes });

  } catch (err) {
    console.error("❌ Erro ao calcular frete:", err.message);

    if (err.response) {
      console.error("   Status:", err.response.status);
      console.error("   Body:", JSON.stringify(err.response.data, null, 2));
    }

    res.status(500).json({
      erro: "Erro ao calcular frete",
      detalhe: err.response?.data || err.message
    });
  }
});

module.exports = router;
