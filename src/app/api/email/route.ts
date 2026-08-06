import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

export async function POST(request: Request) {
  try {
    const { para, assunto, mensagem, pdfUrl } = await request.json();

    const transporter = nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: Number(process.env.EMAIL_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const anexos = [];
    if (pdfUrl) {
      anexos.push({
        filename: 'Comprovante_PhoneCenter.pdf',
        path: pdfUrl, // O Nodemailer faz o download sozinho direto do seu Supabase, sô!
      });
    }

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: para,
      subject: assunto,
      html: mensagem, // Voltamos pro texto simples no corpo do email
      attachments: anexos,
    });

    return NextResponse.json({ message: 'Email enviado com sucesso, caralho!' }, { status: 200 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Deu merda na hora de enviar essa bosta.' }, { status: 500 });
  }
}