const axios = require("axios");

console.log("🚚 FRENET SERVICE CARREGADO");

const FRENET_TOKEN = process.env.FRENET_TOKEN;

if (!FRENET_TOKEN) {
  console.warn("⚠️ FRENET_TOKEN não configurado — cálculo de frete desativado");
}

/* ======================================================
   CEP DE ORIGEM (Sandra Maria) — sem hífen
====================================================== */
const SELLER_CEP = "13486078";

/* ======================================================
   DIMENSÕES PADRÃO DA EMBALAGEM
   Peso em kg | Dimensões em cm
====================================================== */
const PACKAGE = {
  Weight: 0.3,    // 300 gramas
  Length: 20,     // comprimento
  Height: 5,      // altura
  Width: 15       // largura
};

/* ======================================================
   CALCULAR FRETE
====================================================== */
async function calcularFrete(recipientCEP, valorPedido) {
  if (!FRENET_TOKEN) {
    throw new Error("FRENET_TOKEN não configurado");
  }

  // Remove qualquer caractere não numérico do CEP de destino
  const cepLimpo = (recipientCEP || "").replace(/\D/g, "");

  if (cepLimpo.length !== 8) {
    throw new Error("CEP de destino inválido");
  }

  const body = {
    SellerCEP: SELLER_CEP,
    RecipientCEP: cepLimpo,
    ShipmentInvoiceValue: Number(valorPedido) || 0,
    ShippingItemArray: [
      {
        Weight: PACKAGE.Weight,
        Length: PACKAGE.Length,
        Height: PACKAGE.Height,
        Width: PACKAGE.Width,
        Quantity: 1,
        SKU: "SEMIJOIA",
        Category: "Semi-Jóias"
      }
    ]
  };

  console.log(`🚚 Cotando frete | destino: ${cepLimpo} | valor: R$ ${valorPedido}`);

  const response = await axios.post(
    "https://api.frenet.com.br/shipping/quote",
    body,
    {
      headers: {
        "Content-Type": "application/json",
        token: FRENET_TOKEN
      },
      timeout: 15000
    }
  );

  // A Frenet retorna os serviços em ShippingSevicesArray (grafia oficial)
  const servicos = response.data?.ShippingSevicesArray || [];

  // Filtra apenas os que tiveram sucesso (sem Error)
  const disponiveis = servicos
    .filter(s => !s.Error)
    .map(s => ({
      codigo: s.ServiceCode,
      transportadora: s.Carrier,
      servico: s.ServiceDescription,
      preco: Number(s.ShippingPrice),
      prazo: s.DeliveryTime,
      logo: s.CarrierPicture || null
    }))
    .filter(s => s.preco > 0)
    .sort((a, b) => a.preco - b.preco);

  console.log(`🚚 Frenet retornou ${disponiveis.length} opções de frete`);

  return disponiveis;
}

module.exports = { calcularFrete };
