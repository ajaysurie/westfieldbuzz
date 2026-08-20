import { render } from "@react-email/render";
import { Resend } from "resend";
import {
  FridayDigest,
  fridayDigestText,
  type FridayDigestProps,
} from "../../../emails/FridayDigest";

function resendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY is required");
  return new Resend(apiKey);
}

function senderAddress(): string {
  return process.env.EMAIL_FROM ?? "Westfield Buzz <hello@westfieldbuzz.com>";
}

export async function sendSubscriptionConfirmation(input: {
  email: string;
  confirmationUrl: string;
  idempotencyKey: string;
}): Promise<string> {
  const response = await resendClient().emails.send(
    {
      from: senderAddress(),
      to: input.email,
      subject: "Confirm your Westfield Buzz Friday list",
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#12233f"><h1 style="font-family:Georgia,serif">One quick confirmation</h1><p>Confirm that you want the Friday list of fresh events around Westfield.</p><p><a href="${input.confirmationUrl}" style="display:inline-block;background:#12233f;color:white;padding:13px 18px;text-decoration:none">Confirm my Friday list</a></p><p style="color:#5f6672;font-size:13px">If you did not request this, you can ignore this email.</p></div>`,
      text: `Confirm your Westfield Buzz Friday list: ${input.confirmationUrl}\n\nIf you did not request this, ignore this email.`,
    },
    { idempotencyKey: input.idempotencyKey }
  );
  if (response.error || !response.data?.id) {
    throw new Error(response.error?.message ?? "Resend did not return an email id");
  }
  return response.data.id;
}

export async function sendFridayDigest(input: {
  email: string;
  props: FridayDigestProps;
  deliveryKey: string;
}): Promise<string> {
  const html = await render(<FridayDigest {...input.props} />);
  const response = await resendClient().emails.send(
    {
      from: senderAddress(),
      to: input.email,
      subject: `${input.props.issueLabel}: Your Westfield Buzz Friday list`,
      html,
      text: fridayDigestText(input.props),
      headers: {
        "List-Unsubscribe": `<${input.props.unsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    },
    { idempotencyKey: input.deliveryKey }
  );
  if (response.error || !response.data?.id) {
    throw new Error(response.error?.message ?? "Resend did not return an email id");
  }
  return response.data.id;
}
