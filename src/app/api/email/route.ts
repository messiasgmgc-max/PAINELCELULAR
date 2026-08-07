import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
  try {
    const { para, assunto, mensagem, pdfBufferBase64, nomePdf, pdfUrl } = await request.json();

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

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
    // Isso garante suporte total em provedores como Gmail, Outlook e Yahoo!
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

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: para,
      subject: assunto,
      html: htmlContent,
      attachments: anexos,
    });

    return NextResponse.json({ message: 'Email enviado com sucesso!' }, { status: 200 });
  } catch (error: any) {
    console.error('Erro ao enviar e-mail:', error);
    return NextResponse.json({ error: error?.message || 'Erro ao enviar e-mail.' }, { status: 500 });
  }
}