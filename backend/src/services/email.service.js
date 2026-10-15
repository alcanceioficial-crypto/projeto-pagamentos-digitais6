
const { Resend } = require("resend");

console.log("📧 EMAIL SERVICE CARREGADO (via API Resend)");

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const EMAIL_FROM     = process.env.EMAIL_FROM || "onboarding@resend.dev";
const EMAIL_TO       = process.env.EMAIL_TO;

let resend = null;

if (RESEND_API_KEY && EMAIL_TO) {
  resend = new Resend(RESEND_API_KEY);
  console.log(`📧 Resend configurado (API HTTP) | from: ${EMAIL_FROM} | to: ${EMAIL_TO}`);
} else {
  console.warn("⚠️ RESEND_API_KEY ou EMAIL_TO não configurados — envio desativado");
}

function formatCurrency(v) {
  return "R$ " + Number(v).toFixed(2).replace(".", ",");
}

function montarCorpoEmail(pedido, txid) {
  const { nome, whatsapp, endereco, itens, subtotal, frete, total, vendedoraId, vendedoraNome } = pedido;

  let itensTexto = "";
  itens.forEach((item, i) => {
    const sub = item.preco * item.quantidade;
    itensTexto +=
      `  ${i + 1}. ${item.tipo}\n` +
      `     Quantidade: ${item.quantidade}\n` +
      `     Subtotal: ${formatCurrency(sub)}\n\n`;
  });

  const vendedoraTexto = vendedoraId
    ? `\n━━━━━━━━━━━━━━━━━━━━━━\n🎯 VENDEDORA\n━━━━━━━━━━━━━━━━━━━━━━\nNome: ${vendedoraNome || vendedoraId}\nCódigo: ${vendedoraId}\n`
    : "";

  const freteTexto = frete
    ? `\n━━━━━━━━━━━━━━━━━━━━━━\n📦 FRETE\n━━━━━━━━━━━━━━━━━━━━━━\n${frete.transportadora} - ${frete.servico}\nPrazo: ${frete.prazo} dia${frete.prazo > 1 ? "s" : ""}\nValor: ${formatCurrency(frete.preco)}\n`
    : "";

  return (
`🛒 NOVO PEDIDO PAGO — SANDRA MARIA SEMI-JÓIAS

━━━━━━━━━━━━━━━━━━━━━━
👤 DADOS DO CLIENTE
━━━━━━━━━━━━━━━━━━━━━━
Nome: ${nome}
WhatsApp: ${whatsapp}
${vendedoraTexto}
━━━━━━━━━━━━━━━━━━━━━━
📍 ENDEREÇO DE ENTREGA
━━━━━━━━━━━━━━━━━━━━━━
CEP: ${endereco.cep}
Rua: ${endereco.rua}, Nº ${endereco.numero}
${endereco.complemento ? "Complemento: " + endereco.complemento + "\n" : ""}Bairro: ${endereco.bairro}
Cidade: ${endereco.cidade} - ${endereco.estado}
${freteTexto}
━━━━━━━━━━━━━━━━━━━━━━
💎 ITENS DO PEDIDO
━━━━━━━━━━━━━━━━━━━━━━
${itensTexto}━━━━━━━━━━━━━━━━━━━━━━
📦 SUBTOTAL: ${formatCurrency(subtotal || 0)}
📦 FRETE: ${frete ? formatCurrency(frete.preco) : "-"}
💰 TOTAL: ${formatCurrency(total)}
━━━━━━━━━━━━━━━━━━━━━━

✅ Pagamento confirmado.
🔑 TxID: ${txid}`
  );
}

async function enviarEmailPedido(pedido, txid) {
  if (!resend) {
    console.warn("📧 Envio de e-mail desativado (sem credenciais)");
    return;
  }

  const vendedoraInfo = pedido.vendedoraId ? ` [${pedido.vendedoraNome || pedido.vendedoraId}]` : "";
  const assunto = `✅ Pedido pago — ${pedido.nome} — ${formatCurrency(pedido.total)}${vendedoraInfo}`;
  const corpo = montarCorpoEmail(pedido, txid);

  try {
    console.log(`📤 Enviando e-mail via API Resend para ${EMAIL_TO}...`);
    const result = await resend.emails.send({
      from: `Sandra Maria Semi-Jóias <${EMAIL_FROM}>`,
      to: EMAIL_TO,
      subject: assunto,
      text: corpo
    });
    console.log("📧 Resposta do Resend:", JSON.stringify(result));
    console.log(`📧 E-mail enviado com sucesso para ${EMAIL_TO}`);
  } catch (err) {
    console.error("❌ Erro ao enviar e-mail:", err.message);
    console.error(err);
  }
}

module.exports = { enviarEmailPedido };
