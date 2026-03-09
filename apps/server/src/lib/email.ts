/**
 * Email sending via Resend + cold outreach template
 */

import { Resend } from "resend";
import { env } from "@norrjord-intel/env/server";

let resendClient: Resend | null = null;

function getResend(): Resend {
  if (!resendClient) {
    if (!env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }
    resendClient = new Resend(env.RESEND_API_KEY);
  }
  return resendClient;
}

// ─── Cold Outreach Email Template ────────────────────────

interface ColdEmailParams {
  recipientName: string | null;
  companyName: string | null;
  productionType: string | null;
}

const PRODUCTION_LABELS: Record<string, string> = {
  beef: "nötkött",
  lamb: "lammkött",
  pork: "griskött",
  game: "viltkött",
  poultry: "fjäderfä",
  mixed: "kött",
  unknown: "kött",
};

function getProductLabel(type: string | null): string {
  return PRODUCTION_LABELS[type ?? "unknown"] ?? "kött";
}

export function buildColdOutreachEmail(params: ColdEmailParams): {
  subject: string;
  html: string;
} {
  const name = params.recipientName ?? params.companyName ?? "Hej";
  const company = params.companyName ?? "er gård";
  const product = getProductLabel(params.productionType);

  const subject = `${company} — Vill ni nå fler kunder för ert ${product}?`;

  const html = `
<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f9fa;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background-color:#1a1a1a;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.5px;">
                Norrjord
              </h1>
              <p style="margin:6px 0 0;font-size:13px;color:#888888;letter-spacing:1px;text-transform:uppercase;">
                Från producent till konsument
              </p>
            </td>
          </tr>

          <!-- Hero -->
          <tr>
            <td style="padding:40px 40px 24px;">
              <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1a1a1a;line-height:1.3;">
                Sälj ert ${product} direkt till konsumenter
              </h2>
              <p style="margin:0;font-size:16px;color:#666666;line-height:1.6;">
                — utan mellanhänder, utan krångel.
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:0 40px 32px;">
              <p style="margin:0 0 16px;font-size:15px;color:#333333;line-height:1.7;">
                Hej${params.recipientName ? ` ${params.recipientName}` : ""},
              </p>
              <p style="margin:0 0 16px;font-size:15px;color:#333333;line-height:1.7;">
                Vi på <strong>Norrjord</strong> bygger en digital marknadsplats som kopplar ihop svenska köttproducenter
                med konsumenter som vill köpa direkt från gården. Vi har sett att ${company} producerar ${product}
                och tror att ni skulle passa perfekt.
              </p>
              <p style="margin:0 0 16px;font-size:15px;color:#333333;line-height:1.7;">
                Vad vi erbjuder:
              </p>

              <!-- Benefits -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
                <tr>
                  <td style="padding:12px 16px;background-color:#f8faf8;border-radius:8px;border-left:3px solid #22c55e;">
                    <table role="presentation" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:10px;">
                          <strong style="font-size:14px;color:#1a1a1a;">Högre marginaler</strong>
                          <p style="margin:2px 0 0;font-size:13px;color:#666;">Sälj till slutpris utan grossist eller mellanhänder</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:10px;">
                          <strong style="font-size:14px;color:#1a1a1a;">Färdig kundkrets</strong>
                          <p style="margin:2px 0 0;font-size:13px;color:#666;">Vi marknadsför er mot konsumenter i hela Sverige</p>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <strong style="font-size:14px;color:#1a1a1a;">Noll teknikstrul</strong>
                          <p style="margin:2px 0 0;font-size:13px;color:#666;">Vi sköter webshop, betalning och logistik</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <p style="margin:0 0 24px;font-size:15px;color:#333333;line-height:1.7;">
                Just nu söker vi producenter att vara med i vår <strong>pilotgrupp</strong>.
                Det innebär förtur, personlig onboarding och noll kostnad under pilotperioden.
              </p>

              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="border-radius:8px;background-color:#1a1a1a;">
                    <a href="mailto:hej@norrjord.se?subject=Pilotgrupp%20-%20${encodeURIComponent(company)}" style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;">
                      Jag vill veta mer
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:24px 0 0;font-size:14px;color:#999999;line-height:1.6;text-align:center;">
                Eller svara direkt på detta mail — vi återkommer inom 24h.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding:24px 40px;background-color:#fafafa;border-top:1px solid #eee;">
              <p style="margin:0 0 4px;font-size:13px;color:#999999;">
                <strong style="color:#666;">Norrjord</strong> · Från producent till konsument
              </p>
              <p style="margin:0;font-size:12px;color:#bbbbbb;">
                Du får detta mail för att vi tror att ${company} kan dra nytta av vår tjänst.
                Om vi har fel, ber vi om ursäkt — svara bara "ej intresserad" så hör vi inte av oss igen.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();

  return { subject, html };
}

// ─── Send email ──────────────────────────────────────────

export interface SendEmailResult {
  entityId: string;
  email: string;
  success: boolean;
  resendId?: string;
  error?: string;
}

export async function sendColdEmail(params: {
  to: string;
  recipientName: string | null;
  companyName: string | null;
  productionType: string | null;
  fromEmail?: string;
}): Promise<{ success: boolean; id?: string; error?: string }> {
  const resend = getResend();
  const from = params.fromEmail ?? env.RESEND_FROM_EMAIL ?? "Norrjord <hej@norrjord.se>";

  const { subject, html } = buildColdOutreachEmail({
    recipientName: params.recipientName,
    companyName: params.companyName,
    productionType: params.productionType,
  });

  try {
    const result = await resend.emails.send({
      from,
      to: params.to,
      subject,
      html,
    });

    if (result.error) {
      return { success: false, error: result.error.message };
    }

    return { success: true, id: result.data?.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return { success: false, error: message };
  }
}
