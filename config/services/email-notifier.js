const nodemailer = require('nodemailer');

class EmailNotifier {
  constructor() {
    this.transporter = null;
    this.initTransporter();
  }

  initTransporter() {
    // Configuración basada en las variables de entorno de LibreChat-AVI
    const emailConfig = {
      host: process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.EMAIL_PORT) || 587,
      secure: process.env.EMAIL_ENCRYPTION === 'ssl', // true para SSL, false para STARTTLS
      auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD
      }
    };

    // Para Gmail, usar configuración específica si es necesario
    if (process.env.EMAIL_SERVICE === 'gmail') {
      emailConfig.service = 'gmail';
    }

    // Permitir certificados autofirmados si está configurado
    if (process.env.EMAIL_ALLOW_SELFSIGNED === 'true') {
      emailConfig.tls = {
        rejectUnauthorized: false
      };
    }

    this.transporter = nodemailer.createTransport(emailConfig);
  }

  async sendNotification(emailData, customRecipients = null) {
    const { subject, isSuccess, testResults, config, error } = emailData;
    
    // Usar destinatarios personalizados si se proporcionan, sino usar el valor por defecto
    const recipients = customRecipients || config.adminEmail;
    
    const mailOptions = {
      from: `"${process.env.EMAIL_FROM_NAME || 'LibreChat Health Check'}" <${process.env.EMAIL_FROM}>`,
      to: recipients,
      subject: subject,
      html: this.generateEmailHTML(isSuccess, testResults, config, error),
      text: this.generateEmailText(isSuccess, testResults, config, error)
    };

    try {
      const info = await this.transporter.sendMail(mailOptions);
      console.log(`   📧 Email enviado a: ${recipients}`);
      console.log(`   📧 Message ID: ${info.messageId}`);
      return info;
    } catch (error) {
      console.error(`   ❌ Error enviando email: ${error.message}`);
      throw error;
    }
  }

  generateEmailHTML(isSuccess, testResults, config, error = null) {
    const statusIcon = isSuccess ? '✅' : '❌';
    const statusText = isSuccess ? 'EXITOSO' : 'FALLIDO';
    const statusColor = isSuccess ? '#28a745' : '#dc3545';
    
    const timestamp = new Date().toLocaleString('es-ES', {
      timeZone: 'America/Santiago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    let stepsHTML = '';
    if (testResults && testResults.steps) {
      stepsHTML = `
        <h3>📊 Detalle de Pasos:</h3>
        <ul>
          <li>⚙️ Configuración: ${testResults.steps.config ? '✅' : '❌'}</li>
          <li>🔑 Login: ${testResults.steps.login ? '✅' : '❌'}</li>
          <li>📊 Carga de Datos: ${testResults.steps.loadData ? '✅' : '❌'}</li>
          <li>💬 Envío de Mensaje: ${testResults.steps.sendMessage ? '✅' : '❌'}</li>
        </ul>
      `;
    }

    let errorHTML = '';
    if (!isSuccess && error) {
      const detectedPattern = testResults?.details?.detectedErrorPattern || 'no específico';
      const fullResponseContent = testResults?.details?.fullResponseContent || 'No disponible';
      
      errorHTML = `
        <h3>❌ Detalles del Error:</h3>
        <ul style="line-height: 1.6;">
          <li><strong>Error Detectado:</strong> ${detectedPattern}</li>
          <li><strong>Contenido de Respuesta:</strong>
            <pre style="background-color: #f1f1f1; padding: 10px; border-radius: 3px; overflow-x: auto; font-size: 11px; margin-top: 5px; max-height: 400px; overflow-y: auto; white-space: pre-wrap;">${fullResponseContent}</pre>
          </li>
        </ul>
      `;
    }

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <title>Health Check LibreChat</title>
    </head>
    <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f4f4f4;">
        <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; padding: 30px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; border-bottom: 3px solid ${statusColor}; padding-bottom: 20px; margin-bottom: 30px;">
                <h1 style="color: ${statusColor}; margin: 0; font-size: 28px;">
                    ${statusIcon} Health Check ${statusText}
                </h1>
                <p style="color: #666; margin: 10px 0; font-size: 16px;">LibreChat AVI - Sistema de Monitoreo</p>
            </div>
            
            <h3>🕐 Información del Test:</h3>
            <ul style="line-height: 1.6;">
                <li><strong>Fecha:</strong> ${timestamp}</li>
                <li><strong>URL:</strong> ${config.baseUrl}</li>
                <li><strong>Usuario:</strong> ${config.email}</li>
                <li><strong>Agente:</strong> ${config.agentId}</li>
                <li><strong>Duración:</strong> ${testResults ? this.formatDuration(testResults.duration) : 'N/A'}</li>
            </ul>
            
            ${stepsHTML}
            ${errorHTML}
            
            <div style="background-color: #e9ecef; border-radius: 4px; padding: 15px; margin-top: 20px;">
                <p style="margin: 0; font-size: 14px; color: #6c757d;">
                    <strong>📧 Notificación automática</strong> - Sistema de Health Check LibreChat AVI<br>
                    Este email se envía automáticamente para mantenerle informado del estado del sistema.
                </p>
            </div>
        </div>
    </body>
    </html>`;
  }

  generateEmailText(isSuccess, testResults, config, error = null) {
    const statusText = isSuccess ? 'EXITOSO' : 'FALLIDO';
    const timestamp = new Date().toLocaleString('es-ES', {
      timeZone: 'America/Santiago'
    });

    let text = `
HEALTH CHECK ${statusText} - LibreChat AVI

Fecha: ${timestamp}
URL: ${config.baseUrl}
Usuario: ${config.email}
Agente: ${config.agentId}
Duración: ${testResults ? this.formatDuration(testResults.duration) : 'N/A'}

DETALLE DE PASOS:
`;

    if (testResults && testResults.steps) {
      text += `- Configuración: ${testResults.steps.config ? 'OK' : 'FALLÓ'}\n`;
      text += `- Login: ${testResults.steps.login ? 'OK' : 'FALLÓ'}\n`;
      text += `- Carga de Datos: ${testResults.steps.loadData ? 'OK' : 'FALLÓ'}\n`;
      text += `- Envío de Mensaje: ${testResults.steps.sendMessage ? 'OK' : 'FALLÓ'}\n`;
    }

    if (!isSuccess && error) {
      const detectedPattern = testResults?.details?.detectedErrorPattern || 'no específico';
      const fullResponseContent = testResults?.details?.fullResponseContent || 'No disponible';
      
      text += `\nDETALLES DEL ERROR:\n`;
      text += `• Error Detectado: ${detectedPattern}\n`;
      text += `• Contenido de Respuesta: \n${fullResponseContent}\n`;
    }

    text += `\n---\nNotificación automática - Sistema de Health Check LibreChat AVI`;

    return text;
  }

  formatDuration(ms) {
    if (!ms) return 'N/A';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  }

  async testEmail(config) {
    console.log('🧪 Probando configuración de email...');
    
    const testEmailData = {
      subject: '🧪 Test - Health Check LibreChat AVI',
      isSuccess: true,
      testResults: {
        duration: 1234,
        steps: {
          config: true,
          login: true,
          loadData: true,
          sendMessage: true
        }
      },
      config: config
    };

    try {
      await this.sendNotification(testEmailData);
      console.log('✅ Email de prueba enviado exitosamente');
      return true;
    } catch (error) {
      console.error('❌ Error en prueba de email:', error.message);
      return false;
    }
  }
}

module.exports = EmailNotifier; 