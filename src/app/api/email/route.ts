import { NextResponse } from 'next/server';
import { exigirAcesso } from '@/lib/auth/servidor';
import { Resend } from 'resend';
import nodemailer from 'nodemailer';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { para, assunto, mensagem, pdfBufferBase64, nomePdf, pdfUrl } = await request.json();

    const acesso = await exigirAcesso(request, {});
    if (!acesso.ok) return acesso.resposta;
    if (pdfUrl && !/^https?:\/\//i.test(String(pdfUrl))) {
      return NextResponse.json({ error: 'Anexo precisa ser um link http(s).' }, { status: 400 });
    }

    let htmlContent = mensagem || '';
    const anexos: any[] = [];

    // Se o PDF foi gerado e enviado em base64, anexa como arquivo .pdf real!
    if (pdfBufferBase64) {
      anexos.push({
        filename: nomePdf || 'Recibo_Venda.pdf',
        content: Buffer.from(pdfBufferBase64, 'base64'),
        contentType: 'application/pdf',
      });
    } else if (pdfUrl) {
      anexos.push({
        filename: nomePdf || 'Comprovante_PhoneCenter.pdf',
        path: pdfUrl,
      });
    }

    // Processa imagens Base64 no corpo do HTML e converte em anexos inline (CID)
    const base64Regex = /src=["'](data:image\/(png|jpeg|jpg|webp|svg\+xml);base64,([^"']+))["']/gi;
    let match;
    let imgCounter = 1;

    while ((match = base64Regex.exec(mensagem)) !== null) {
      const fullSrc = match[1];
      const format = match[2] === 'svg+xml' ? 'svg' : match[2];
      const base64Data = match[3];
      const cidName = `inline_img_${imgCounter}@phonecenter`;

      anexos.push({
        filename: `imagem_${imgCounter}.${format}`,
        content: Buffer.from(base64Data, 'base64'),
        cid: cidName,
      });

      htmlContent = htmlContent.replace(fullSrc, `cid:${cidName}`);
      imgCounter++;
    }

    // 1. Se configurado Resend (preferencial)
    if (process.env.RESEND_API_KEY) {
      const resend = new Resend(process.env.RESEND_API_KEY);
      const fromEmail = process.env.RESEND_FROM_EMAIL || 'Phone Center <contato@phonecenter.tech>';

      const { data, error } = await resend.emails.send({
        from: fromEmail,
        to: para,
        subject: assunto,
        html: htmlContent,
        attachments: anexos.map((a) => ({
          filename: a.filename,
          content: a.content,
          path: a.path,
        })),
      });

      if (error) {
        console.error('Erro Resend API:', error);
        throw new Error(error.message);
      }

      return NextResponse.json({ message: 'Email enviado com sucesso via Resend!', id: data?.id }, { status: 200 });
    }

    // 2. Fallback para Nodemailer / SMTP
    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: para,
      subject: assunto,
      html: htmlContent,
      attachments: anexos,
    });

    return NextResponse.json({ message: 'Email enviado com sucesso via SMTP!' }, { status: 200 });
  } catch (error: any) {
    console.error('Erro ao enviar e-mail:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao enviar e-mail.' }, { status: 500 });
  }
}