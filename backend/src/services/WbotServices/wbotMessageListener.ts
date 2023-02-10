import {
  AnyWASocket,
  downloadContentFromMessage,
  extractMessageContent,
  getContentType,
  jidNormalizedUser,
  MediaType,
  MessageUpsertType,
  proto,
  WALegacySocket,
  WAMessage,
  WAMessageStubType,
  WAMessageUpdate,
  WASocket
} from "@adiwajshing/baileys";
import * as Sentry from "@sentry/node";
import { writeFile } from "fs";
import { join } from "path";
import { promisify } from "util";
import { debounce } from "../../helpers/Debounce";
import formatBody from "../../helpers/Mustache";
import { getIO } from "../../libs/socket";
import { Store } from "../../libs/store";
import Contact from "../../models/Contact";
import Message from "../../models/Message";
import Setting from "../../models/Setting";
import Ticket from "../../models/Ticket";
import { logger } from "../../utils/logger";
import CreateOrUpdateContactService from "../ContactServices/CreateOrUpdateContactService";
import CreateMessageService from "../MessageServices/CreateMessageService";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import { sayChatbot } from "./ChatBotListener";
import hourExpedient from "./hourExpedient";

const fs = require('fs')
var axios = require('axios');

type Session = AnyWASocket & {
  id?: number;
  store?: Store;
};

interface ImessageUpsert {
  messages: proto.IWebMessageInfo[];
  type: MessageUpsertType;
}

interface IMe {
  name: string;
  id: string;
}

interface IMessage {
  messages: WAMessage[];
  isLatest: boolean;
}

const writeFileAsync = promisify(writeFile);

const getTypeMessage = (msg: proto.IWebMessageInfo): string => {
  return getContentType(msg.message);
};

const getBodyButton = (msg: proto.IWebMessageInfo): string => {
  if (msg.key.fromMe && msg?.message?.buttonsMessage?.contentText) {
    let bodyMessage = `*${msg?.message?.buttonsMessage?.contentText}*`;
    // eslint-disable-next-line no-restricted-syntax
    for (const buton of msg.message?.buttonsMessage?.buttons) {
      //console.log(`BUTTON 71: ${buton}`);
      bodyMessage += `\n\n${buton.buttonText?.displayText}`;
    }
    return bodyMessage;
  }

  if (msg.key.fromMe && msg?.message?.listMessage) {
    let bodyMessage = `*${msg?.message?.listMessage?.description}*`;
    // eslint-disable-next-line no-restricted-syntax
    for (const buton of msg.message?.listMessage?.sections) {
      // eslint-disable-next-line no-restricted-syntax
      for (const rows of buton.rows) {
        bodyMessage += `\n\n${rows.title}`;
      }
    }

    return bodyMessage;
  }
};

const getviewOnceMessage = (msg: proto.IWebMessageInfo): string => {
  if (msg.key.fromMe && msg?.message?.viewOnceMessage?.message?.buttonsMessage?.contentText) {
    let bodyMessage = `*${msg?.message?.viewOnceMessage?.message?.buttonsMessage?.contentText}*`;
    // eslint-disable-next-line no-restricted-syntax
    for (const buton of msg.message?.viewOnceMessage?.message?.buttonsMessage?.buttons) {
      //console.log(buton);
      bodyMessage += `\n\n${buton.buttonText?.displayText}`;
    }
    return bodyMessage;
  }

  if (msg.key.fromMe && msg?.message?.viewOnceMessage?.message?.listMessage) {
    let bodyMessage = `*${msg?.message?.viewOnceMessage?.message?.listMessage?.description}*`;
    // eslint-disable-next-line no-restricted-syntax
    for (const buton of msg.message?.viewOnceMessage?.message?.listMessage?.sections) {
      // eslint-disable-next-line no-restricted-syntax
      for (const rows of buton.rows) {
        bodyMessage += `\n\n${rows.title}`;
      }
    }

    return bodyMessage;
  }
};

export const getBodyMessage = (msg: proto.IWebMessageInfo): string | null => {
  try {
    const type = getTypeMessage(msg);
    const types = {
      conversation: msg.message.conversation,
      imageMessage: msg.message.imageMessage?.caption,
      videoMessage: msg.message.videoMessage?.caption,
      extendedTextMessage: msg.message.extendedTextMessage?.text,
      buttonsResponseMessage: (msg.message.buttonsResponseMessage?.selectedDisplayText),
      listResponseMessage: msg.message.listResponseMessage?.singleSelectReply?.selectedRowId,
      templateButtonReplyMessage: msg.message?.templateButtonReplyMessage?.selectedId,
      messageContextInfo: msg.message.buttonsResponseMessage?.selectedDisplayText || msg.message.listResponseMessage?.title,
      buttonsMessage: (msg?.message?.buttonsMessage?.contentText) || msg.message.listResponseMessage?.title,
      contactMessage:msg.message.contactMessage?.vcard,
      stickerMessage: "sticker",
      documentMessage: msg.message.documentMessage?.title,
      audioMessage: "Áudio",
      viewOnceMessage: getviewOnceMessage(msg) || msg.message.listResponseMessage?.title,
      listMessage: getBodyButton(msg) || msg.message.listResponseMessage?.title
    };

    const objKey = Object.keys(types).find(key => key === type);

    if (!objKey) {
      logger.warn(`#### Nao achou o type: ${type}
${JSON.stringify(msg?.message)}`);
      Sentry.setExtra("Mensagem", { BodyMsg: msg.message, msg, type });
      Sentry.captureException(
        new Error("Novo Tipo de Mensagem em getTypeMessage")
      );
    }
    return types[type];
  } catch (error) {
    Sentry.setExtra("Error getTypeMessage", { msg, BodyMsg: msg.message });
    Sentry.captureException(error);
    //console.log(error);
  }
};

export const getQuotedMessage = (msg: proto.IWebMessageInfo): any => {
  const body = extractMessageContent(msg.message)[
    Object.keys(msg?.message).values().next().value
  ];

  if (!body?.contextInfo?.quotedMessage) return;
  const quoted = extractMessageContent(
    body?.contextInfo?.quotedMessage[
      Object.keys(body?.contextInfo?.quotedMessage).values().next().value
    ]
  );

  return quoted;
};

const getMeSocket = (wbot: Session): IMe => {
  return wbot.type === "legacy"
    ? {
        id: jidNormalizedUser((wbot as WALegacySocket).state.legacy.user.id),
        name: (wbot as WALegacySocket).state.legacy.user.name
      }
    : {
        id: jidNormalizedUser((wbot as WASocket).user.id),
        name: (wbot as WASocket).user.name
      };
};

const getSenderMessage = (
  msg: proto.IWebMessageInfo,
  wbot: Session
): string => {
  const me = getMeSocket(wbot);
  if (msg.key.fromMe) return me.id;

  const senderId =
    msg.participant || msg.key.participant || msg.key.remoteJid || undefined;

  return senderId && jidNormalizedUser(senderId);
};

const getContactMessage = async (msg: proto.IWebMessageInfo, wbot: Session) => {
  if (wbot.type === "legacy") {
    return wbot.store.contacts[msg.key.participant || msg.key.remoteJid] as IMe;
  }

  const isGroup = msg.key.remoteJid.includes("g.us");
  const rawNumber = msg.key.remoteJid.replace(/\D/g, "");
  return isGroup
    ? {
        id: getSenderMessage(msg, wbot),
        name: msg.pushName
      }
    : {
        id: msg.key.remoteJid,
        name: msg.key.fromMe ? rawNumber : msg.pushName
      };
};

const downloadMedia = async (msg: proto.IWebMessageInfo) => {
  const mineType =
    msg.message?.imageMessage ||
    msg.message?.audioMessage ||
    msg.message?.videoMessage ||
    msg.message?.stickerMessage ||
    msg.message?.documentMessage;

  const messageType = mineType.mimetype
    .split("/")[0]
    .replace("application", "document")
    ? (mineType.mimetype
        .split("/")[0]
        .replace("application", "document") as MediaType)
    : (mineType.mimetype.split("/")[0] as MediaType);

  const stream = await downloadContentFromMessage(
    msg.message.audioMessage ||
      msg.message.videoMessage ||
      msg.message.documentMessage ||
      msg.message.imageMessage ||
      msg.message.stickerMessage ||
      msg.message.extendedTextMessage?.contextInfo.quotedMessage.imageMessage,
    messageType
  );

  let buffer = Buffer.from([]);

  // eslint-disable-next-line no-restricted-syntax
  for await (const chunk of stream) {
    buffer = Buffer.concat([buffer, chunk]);
  }

  if (!buffer) {
    throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
  }

  let filename = msg.message?.documentMessage?.fileName || "";

  if (!filename) {
    const ext = mineType.mimetype.split("/")[1].split(";")[0];
    filename = `${new Date().getTime()}.${ext}`;
  }

  const media = {
    data: buffer,
    mimetype: mineType.mimetype,
    filename
  };

  return media;
};

const verifyContact = async (
  msgContact: IMe,
  wbot: Session
): Promise<Contact> => {
  let profilePicUrl: string;
  try {
    profilePicUrl = await wbot.profilePictureUrl(msgContact.id);
  } catch {
    profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
  }

  const contactData = {
    name: msgContact?.name || msgContact.id.replace(/\D/g, ""),
    number: msgContact.id.replace(/\D/g, ""),
    profilePicUrl,
    isGroup: msgContact.id.includes("g.us")
  };

  const contact = CreateOrUpdateContactService(contactData);

  return contact;
};

export const getQuotedMessageId = (msg: proto.IWebMessageInfo): string => {
  const body = extractMessageContent(msg.message)[
    Object.keys(msg?.message).values().next().value
  ];

  return body?.contextInfo?.stanzaId;
};

const verifyQuotedMessage = async (
  msg: proto.IWebMessageInfo
): Promise<Message | null> => {
  if (!msg) return null;
  const quoted = getQuotedMessageId(msg);

  if (!quoted) return null;

  const quotedMsg = await Message.findOne({
    where: { id: quoted }
  });

  if (!quotedMsg) return null;

  return quotedMsg;
};

const verifyMediaMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact
): Promise<Message> => {
  const quotedMsg = await verifyQuotedMessage(msg);

  const media = await downloadMedia(msg);

  if (!media) {
    throw new Error("ERR_WAPP_DOWNLOAD_MEDIA");
  }

  if (!media.filename) {
    const ext = media.mimetype.split("/")[1].split(";")[0];
    media.filename = `${new Date().getTime()}.${ext}`;
  }

  try {
    await writeFileAsync(
      join(__dirname, "..", "..", "..", "public", media.filename),
      media.data,
      "base64"
    );
  } catch (err) {
    Sentry.captureException(err);
    logger.error(err);
  }

  const body = getBodyMessage(msg);
  const messageData = {
    id: msg.key.id,
    ticketId: ticket.id,
    contactId: msg.key.fromMe ? undefined : contact.id,
    body: body || media.filename,
    fromMe: msg.key.fromMe,
    read: msg.key.fromMe,
    mediaUrl: media.filename,
    mediaType: media.mimetype.split("/")[0],
    quotedMsgId: quotedMsg?.id,
    ack: msg.status,
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    dataJson: JSON.stringify(msg)
  };

  await ticket.update({
    lastMessage: body || media.filename
  });

  const newMessage = await CreateMessageService({ messageData });

  return newMessage;
};

export const verifyMessage = async (
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact,
  textMassMessage?: string
): Promise<Message> => {
  const quotedMsg = await verifyQuotedMessage(msg);
  const body = getBodyMessage(msg);

  const messageData = {
    id: msg.key.id,
    ticketId: ticket.id,
    contactId: msg.key.fromMe ? undefined : contact.id,
    body,
    fromMe: msg.key.fromMe,
    mediaType: getTypeMessage(msg),
    read: msg.key.fromMe,
    quotedMsgId: quotedMsg?.id,
    ack: msg.status,
    remoteJid: msg.key.remoteJid,
    participant: msg.key.participant,
    dataJson: JSON.stringify(msg),
    textMassMessage
  };

  await ticket.update({
    lastMessage: body
  });

  return CreateMessageService({ messageData });
};

const isValidMsg = (msg: proto.IWebMessageInfo): boolean => {
  if (msg.key.remoteJid === "status@broadcast") return false;
  const msgType = getTypeMessage(msg);
  const ifType =
    msgType === "conversation" ||
    msgType === "extendedTextMessage" ||
    msgType === "audioMessage" ||
    msgType === "videoMessage" ||
    msgType === "imageMessage" ||
    msgType === "documentMessage" ||
    msgType === "stickerMessage" ||
    msgType === "buttonsResponseMessage" ||
    msgType === "listResponseMessage" ||
    msgType === "listMessage";

  return !!ifType;
};

const verifyQueue = async (
  wbot: Session,
  msg: proto.IWebMessageInfo,
  ticket: Ticket,
  contact: Contact
) => {
  const { queues, greetingMessage } = await ShowWhatsAppService(wbot.id!);

  if (queues.length === 1) {
    await UpdateTicketService({
      ticketData: { queueId: queues[0].id },
      ticketId: ticket.id
    });

    return;
  }

  const selectedOption =
    msg?.message?.buttonsResponseMessage?.selectedButtonId ||
    msg?.message?.listResponseMessage?.singleSelectReply.selectedRowId ||
    getBodyMessage(msg);

  const choosenQueue = queues[+selectedOption - 1];
  const fila2 = choosenQueue?.name;
  if (fila2 === "Segunda-Via") {
    function validaCpfCnpj(val) {
      if (val.length == 11) {
        var cpf = val.trim();
    
        cpf = cpf.replace(/\./g, '');
        cpf = cpf.replace('-', '');
        cpf = cpf.split('');
    
        var v1 = 0;
        var v2 = 0;
        var aux = false;
    
        for (var i = 1; cpf.length > i; i++) {
          if (cpf[i - 1] != cpf[i]) {
            aux = true;
          }
        }
    
        if (aux == false) {
          return false;
        }
    
        for (var i = 0, p = 10; (cpf.length - 2) > i; i++, p--) {
          v1 += cpf[i] * p;
        }
    
        v1 = ((v1 * 10) % 11);
    
        if (v1 == 10) {
          v1 = 0;
        }
    
        if (v1 != cpf[9]) {
          return false;
        }
    
        for (var i = 0, p = 11; (cpf.length - 1) > i; i++, p--) {
          v2 += cpf[i] * p;
        }
    
        v2 = ((v2 * 10) % 11);
    
        if (v2 == 10) {
          v2 = 0;
        }
    
        if (v2 != cpf[10]) {
          return false;
        } else {
          return true;
        }
      } else if (val.length == 14) {
        var cnpj = val.trim();
    
        cnpj = cnpj.replace(/\./g, '');
        cnpj = cnpj.replace('-', '');
        cnpj = cnpj.replace('/', '');
        cnpj = cnpj.split('');
    
        var v1 = 0;
        var v2 = 0;
        var aux = false;
    
        for (var i = 1; cnpj.length > i; i++) {
          if (cnpj[i - 1] != cnpj[i]) {
            aux = true;
          }
        }
    
        if (aux == false) {
          return false;
        }
    
        for (var i = 0, p1 = 5, p2 = 13; (cnpj.length - 2) > i; i++, p1--, p2--) {
          if (p1 >= 2) {
            v1 += cnpj[i] * p1;
          } else {
            v1 += cnpj[i] * p2;
          }
        }
    
        v1 = (v1 % 11);
    
        if (v1 < 2) {
          v1 = 0;
        } else {
          v1 = (11 - v1);
        }
    
        if (v1 != cnpj[12]) {
          return false;
        }
    
        for (var i = 0, p1 = 6, p2 = 14; (cnpj.length - 1) > i; i++, p1--, p2--) {
          if (p1 >= 2) {
            v2 += cnpj[i] * p1;
          } else {
            v2 += cnpj[i] * p2;
          }
        }
    
        v2 = (v2 % 11);
    
        if (v2 < 2) {
          v2 = 0;
        } else {
          v2 = (11 - v2);
        }
    
        if (v2 != cnpj[13]) {
          return false;
        } else {
          return true;
        }
      } else {
        return false;
      }
    }
    
    function timeout(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    async function sleep(time) {
      await timeout(time);
    }
    const ipmkauth = await Setting.findOne({
      where: {
        key: "ipmkauth"
      }
    });
  
    const clientidmkauth = await Setting.findOne({
      where: {
        key: "clientidmkauth"
      }
    });
  
    const clientesecretmkauth = await Setting.findOne({
      where: {
        key: "clientesecretmkauth"
      }
    });
    const sendMessage = async (
      wbot: Session,
      contact: Contact,
      ticket: Ticket,
      body: string
    ) => {
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        {
          text: formatBody(body, contact)
        }
      );
      verifyMessage(sentMessage, ticket, contact);
    };
    const isNumeric = (value: string) => /^-?\d+$/.test(value);
    let cpfcnpj
    cpfcnpj = selectedOption;
    cpfcnpj = cpfcnpj.replace(/\./g, '');
    cpfcnpj = cpfcnpj.replace('-', '')
    cpfcnpj = cpfcnpj.replace('/', '')
    cpfcnpj = cpfcnpj.replace(' ', '')
    cpfcnpj = cpfcnpj.replace(',', '')

    function makeid(length) {
      var result = '';
      var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      var charactersLength = characters.length;
      for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
      }
      return result;
    }   
    const sendMessageLink = async (
      wbot: Session,
      contact: Contact,
      ticket: Ticket,
      url: string,
      caption: string
    ) => {
    
      let sentMessage
      try {
        sentMessage = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          {
            document: url ? { url } : fs.readFileSync(`public/temp/${caption}-${makeid(10)}`),
            fileName: caption,
            caption: caption,
            mimetype: 'application/pdf'
          }
        );
      } catch (error) {
        sentMessage = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          {
            text: formatBody('Não consegui enviar o PDF, tente novamente!', contact)
          }
        );
      }
      verifyMessage(sentMessage, ticket, contact);
    };
    console.log("648: " + msg?.message);
    
    const numberCPFCNPJ = cpfcnpj
    if (ipmkauth.value != "" && clientidmkauth.value != "" && clientesecretmkauth.value != "") {
      if (isNumeric(numberCPFCNPJ) === true) {
        if (cpfcnpj.length > 2) {
          const isCPFCNPJ = validaCpfCnpj(numberCPFCNPJ)
          if (isCPFCNPJ) {
            //const token = await CheckSettingsHelper("OBTEM O TOKEN DO BANCO (dei insert na tabela settings)")
             const body = `Aguarde! Estamos consultando na base de dados!`;
            try {
              await sleep(2000)
              await sendMessage(wbot, contact, ticket, body);
            } catch (error) {
              //console.log('Não consegui enviar a mensagem!')
            }
      
              let urlmkauth = ipmkauth.value
              let url = `${urlmkauth}/api/`;
              const Client_Id = clientidmkauth.value
              const Client_Secret = clientesecretmkauth.value
              axios({
                  rejectUnauthorized: true,
                  method:'get',
                  url,
                  auth: {
                      username: Client_Id,
                      password: Client_Secret
                  }
              })
              .then(function (response) {
                //console.log(`RESPONSE 544: ${response}`)
                const jtw = response.data
                var config = {
                  method: 'GET',
                  url: `${urlmkauth}/api/cliente/show/${numberCPFCNPJ}`,
                  headers: {
                    Authorization: `Bearer ${jtw}`
                  }
                };
                 axios.request(config)
                 .then(async function (response) {
                  if (response.data == 'NULL') {
                    const body = `Cadastro não localizado! *CPF/CNPJ* incorreto ou inválido. Tenta novamente!`;
                    try {
                      await sleep(2000)
                      await sendMessage(wbot, contact, ticket, body);
                    } catch (error) {
                      //console.log('Não consegui enviar a mensagem!')
                    }                 
                  } else {
                       let nome
                       let cpf_cnpj
                       let valor
                       let linhadig
                       let referencia
                       let status
                       let datavenc
                       let descricao
                       let titulo
                       let statusCorrigido
                       let valorCorrigido
      
                       nome = response.data.dados_cliente.titulos.nome
                       cpf_cnpj = response.data.dados_cliente.titulos.cpf_cnpj
                       valor = response.data.dados_cliente.titulos.valor
                       linhadig = response.data.dados_cliente.titulos.linhadig
                       referencia = response.data.dados_cliente.titulos.referencia
                       status = response.data.dados_cliente.titulos.status
                       datavenc = response.data.dados_cliente.titulos.datavenc
                       descricao = response.data.dados_cliente.titulos.descricao
                       titulo = response.data.dados_cliente.titulos.titulo
                       statusCorrigido = status[0].toUpperCase() + status.substr(1);
                       valorCorrigido = valor.replace(".", ",");
                 
                       var curdate = new Date(datavenc)
                       const mesCorreto = curdate.getMonth() + 1
                       const ano = ('0' + curdate.getFullYear()).slice(-4)
                       const mes = ('0' + mesCorreto).slice(-2)
                       const dia = ('0' + curdate.getDate()).slice(-2)
                       const anoMesDia = `${dia}/${mes}/${ano}`
      
                         try {
                           const body = `Localizei seu Cadastro! *${nome}* só mais um instante por favor!`;
                           await sleep(2000)
                           await sendMessage(wbot, contact, ticket, body);               
                           const bodyBoleto = `Segue a segunda-via da sua Fatura!\n\n*Nome:* ${nome}\n*Valor:* R$ ${valorCorrigido}\n*Data Vencimento:* ${anoMesDia}\n*Link:* ${urlmkauth}/boleto/21boleto.php?titulo=${titulo}\n\nVou mandar o *código de barras* na próxima mensagem para ficar mais fácil para você copiar!`
                           await sleep(2000)
                           await sendMessage(wbot, contact, ticket, bodyBoleto);
                           const bodyLinha = `${linhadig}`
                           await sleep(2000)
                           await sendMessage(wbot, contact, ticket, bodyLinha);     
                           const bodyPdf = `Agora vou te enviar o boleto em *PDF* caso você precise.`
                           await sleep(2000)
                           await sendMessage(wbot, contact, ticket, bodyPdf);
                           await sleep(2000)    
                                                //GERA O PDF                                    
                           var options = {
                            method: 'GET',
                            url: 'http://38.72.132.41/boleto.php',
                            params: {link: `${urlmkauth}/boleto/21boleto.php?titulo=${titulo}`}
                          };   
                          axios.request(options).then(async function (response) {
                            let linkBoleto = response.data;
                            const nomePDF = `Boleto-${nome}-${dia}-${mes}-${ano}`
                            await sendMessageLink(wbot, contact, ticket, linkBoleto, nomePDF)   
                            await sleep(3000) 
                            const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                            await sendMessage(wbot, contact, ticket, bodyfinaliza);
                            await sleep(1000)
                            const ticketUpdateAgent = {
                              ticketData: {
                                status: "closed"
                              },
                              ticketId: ticket.id
                            };
                            await UpdateTicketService(ticketUpdateAgent);                       
                              const body = `Sua solicitação foi atendida ? \nSe *SIM* selecione *Finalizar*.\nCaso não sido atendida, volte ao menu anterior para continuar!`
                                 
                          }).catch(function (error) {
                            //console.error(error);
                          });     
                                                           
                   
                         } catch (error) { 
                           //console.log('Não consegui enviar a mensagem!')
                         }
                 }})
                 .catch(async function (error) {
                   try {
                     const bodyBoleto = `Não consegui encontrar seu cadastro.\n\nPor favor tente novamente!\nOu digite *#* para voltar ao *Menu Anterior*`
                     await sleep(2000)
                     await sendMessage(wbot, contact, ticket, bodyBoleto);
                   } catch (error) {
                     //console.log('Não consegui enviar a mensagem!')
                   }
                 
                 });           
              })
              .catch(async function (error) {
                const bodyfinaliza = `Opss! Algo de errado aconteceu! Digite *#* para voltar ao menu anterior e fale com um atendente!`
                await sendMessage(wbot, contact, ticket, bodyfinaliza);
              });
          } else {
              const body = `Este CPF/CNPJ não é válido!\n\nPor favor tente novamente!\nOu digite *#* para voltar ao *Menu Anterior*`;
              await sleep(2000)
              await sendMessage(wbot, contact, ticket, body);     
          }
        }    
      }
    }
  }

  const Hr = new Date();
  var days = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const day = days[ Hr.getDay() ];
  const dayi = day+"i"
  const dayf = day+"f"
  
  const buttonActive = await Setting.findOne({
    where: {
      key: "chatBotType"
    }
  });

  const botText = async () => {
    if (choosenQueue) {
      await UpdateTicketService({
        ticketData: { queueId: choosenQueue.id },
        ticketId: ticket.id
      });

      if (choosenQueue.chatbots.length > 0) {


          let options = "";
          choosenQueue.chatbots.forEach((chatbot, index) => {
            options += `*[ ${index + 1} ]* - ${chatbot.name}\n`;
          });
          const body = formatBody(`\u200e${choosenQueue.greetingMessage}\n\n${options}\n*#* Voltar para o menu principal`,contact);
          const sentMessage = await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, {
              text: body
            }
          );
  
          await verifyMessage(sentMessage, ticket, contact);          
        
      }

      if (!choosenQueue.chatbots.length) {



          const body = formatBody(`\u200e${choosenQueue.greetingMessage}`,contact);
          const sentMessage = await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, {
              text: body
            }
          );
          await verifyMessage(sentMessage, ticket, contact);
         

      }
    } else {
      let options = "";

      queues.forEach((queue, index) => {
        options += `*[ ${index + 1} ]* - ${queue.name}\n`;
      });

      const body = formatBody(
        `\u200e${greetingMessage}\n\n${options}`,
        contact
      );

      const debouncedSentMessage = debounce(
        async () => {
          const sentMessage = await wbot.sendMessage(
            `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
            {
              text: body
            }
          );

          verifyMessage(sentMessage, ticket, contact);
        },
        3000,
        ticket.id
      );

      debouncedSentMessage();
    }
  };

  const botButton = async () => {
    if (choosenQueue) {
      await UpdateTicketService({
        ticketData: { queueId: choosenQueue.id },
        ticketId: ticket.id
      });

      if (choosenQueue.chatbots.length > 0) {

 
        const buttons = [];
        choosenQueue.chatbots.forEach((queue, index) => {
          buttons.push({
            buttonId: `${index + 1}`,
            buttonText: { displayText: queue.name },
            type: 1
          });
        });

        const buttonMessage = {
          text: formatBody(`\u200e${choosenQueue.greetingMessage}`, contact),
          buttons,
          headerType: 4
        };

        const sendMsg = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          buttonMessage
        );

        await verifyMessage(sendMsg, ticket, contact);
      
      }

      if (!choosenQueue.chatbots.length) {


        const body = formatBody(
          `\u200e${choosenQueue.greetingMessage}`,
          contact
        );
        const sentMessage = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          {
            text: body
          }
        );

        await verifyMessage(sentMessage, ticket, contact);
      
    }
    } else {
      const buttons = [];
      queues.forEach((queue, index) => {
        buttons.push({
          buttonId: `${index + 1}`,
          buttonText: { displayText: queue.name },
          type: 4
        });
      });

      const buttonMessage = {
        text: formatBody(`\u200e${greetingMessage}`, contact),
        buttons,
        headerType: 4
      };

      const sendMsg = await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        buttonMessage
      );

      await verifyMessage(sendMsg, ticket, contact);
    }
  };

  const botList = async () => {
    if (choosenQueue) {
      await UpdateTicketService({
        ticketData: { queueId: choosenQueue.id },
        ticketId: ticket.id
      });

      if (choosenQueue.chatbots.length > 0) {


        const sectionsRows = [];
        choosenQueue.chatbots.forEach((queue, index) => {
          sectionsRows.push({
            title: queue.name,
            rowId: `${index + 1}`
          });
        });

        const sections = [
          {
            title: "Menu",
            rows: sectionsRows
          }
        ];

        const listMessage = {
          text: formatBody(`\u200e${choosenQueue.greetingMessage}`, contact),
          buttonText: "Escolha uma opção",
          sections
        };

        const sendMsg = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          listMessage
        );

        await verifyMessage(sendMsg, ticket, contact);
      
    }

      if (!choosenQueue.chatbots.length) {


        const body = formatBody(
          `\u200e${choosenQueue.greetingMessage}`,
          contact
        );

        const sentMessage = await wbot.sendMessage(
          `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
          {
            text: body
          }
        );

        await verifyMessage(sentMessage, ticket, contact);

    }
    } else {
      const sectionsRows = [];

      queues.forEach((queue, index) => {
        sectionsRows.push({
          title: queue.name,
          rowId: `${index + 1}`
        });
      });

      const sections = [
        {
          title: "Menu",
          rows: sectionsRows
        }
      ];

      const listMessage = {
        text: formatBody(`\u200e${greetingMessage}`, contact),
        buttonText: "Escolha uma opção",
        sections
      };

      const sendMsg = await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        listMessage
      );

      await verifyMessage(sendMsg, ticket, contact);
    }
  };

  if (buttonActive.value === "text") {
    return botText();
    
  }

  if (buttonActive.value === "button" && queues.length > 4) {
    return botText();
  }

  if (buttonActive.value === "button" && queues.length <= 4) {
    return botButton();
  }

  if (buttonActive.value === "list") {
    return botList();
  }
  
};

const handleMessage = async (
  msg: proto.IWebMessageInfo,
  wbot: Session
): Promise<void> => {
  if (!isValidMsg(msg)) return;
  try {
    let msgContact: IMe;
    let groupContact: Contact | undefined;

    const isGroup = msg.key.remoteJid?.endsWith("@g.us");

    const msgIsGroupBlock = await Setting.findOne({
      where: { key: "CheckMsgIsGroup" }
    });

    const bodyMessage = getBodyMessage(msg);
    const msgType = getTypeMessage(msg);

    const hasMedia =
      msg.message?.audioMessage ||
      msg.message?.imageMessage ||
      msg.message?.videoMessage ||
      msg.message?.documentMessage ||
      msg.message.stickerMessage;

    if (msg.key.fromMe) {
      if (/\u200e/.test(bodyMessage)) return;

      if (
        !hasMedia &&
        msgType !== "conversation" &&
        msgType !== "extendedTextMessage" &&
        msgType !== "vcard"
      )
        return;
      msgContact = await getContactMessage(msg, wbot);
    } else {
      msgContact = await getContactMessage(msg, wbot);
    }

    if (msgIsGroupBlock?.value === "enabled" && isGroup) return;

    if (isGroup) {
      const grupoMeta = await wbot.groupMetadata(msg.key.remoteJid, false);
      const msgGroupContact = {
        id: grupoMeta.id,
        name: grupoMeta.subject
      };
      groupContact = await verifyContact(msgGroupContact, wbot);
    }
    const whatsapp = await ShowWhatsAppService(wbot.id!);

    const count = wbot.store.chats.get(
      msg.key.remoteJid || msg.key.participant
    );

    const unreadMessages = msg.key.fromMe ? 0 : count?.unreadCount || 1;

    const contact = await verifyContact(msgContact, wbot);

    if (
      unreadMessages === 0 &&
      whatsapp.farewellMessage &&
      formatBody(whatsapp.farewellMessage, contact) === bodyMessage
    )
      return;

    const ticket = await FindOrCreateTicketService({
      contact,
      whatsappId: wbot.id!,
      unreadMessages,
      groupContact,
      channel: "whatsapp"
    });

    if (hasMedia) {
      await verifyMediaMessage(msg, ticket, contact);
    } else {
      await verifyMessage(msg, ticket, contact);
    }

    const checkExpedient = await hourExpedient();
    //////////////////////////////////////////////////////////////////////////
    
    if (checkExpedient) {
      if (
        !ticket.queue &&
        !isGroup &&
        !msg.key.fromMe &&
        !ticket.userId &&
        whatsapp.queues.length >= 1
      ) {
        await verifyQueue(wbot, msg, ticket, contact);
      }

      if (ticket.queue && ticket.queueId) {
        if (!ticket.user) {
          await sayChatbot(ticket.queueId, wbot, ticket, contact, msg);
        }
      }
    } else {
      const getLastMessageFromMe = await Message.findOne({
        where: {
          ticketId: ticket.id,
          fromMe: true
        },
        order: [["createdAt", "DESC"]]
      });

      if (
        getLastMessageFromMe?.body ===
        formatBody(`\u200e${whatsapp.outOfWorkMessage}`, contact)
      )
        return;

      const body = formatBody(`\u200e${whatsapp.outOfWorkMessage}`, contact);
      const sentMessage = await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        {
          text: body
        }
      );

      await verifyMessage(sentMessage, ticket, contact);
    }
    /////////////////////////////////////////////////////////////////////////////////
  } catch (err) {
    //console.log(err);
    Sentry.captureException(err);
    logger.error(`Error handling whatsapp message: Err: ${err}`);
  }
};

const handleMsgAck = async (
  msg: WAMessage,
  chat: number | null | undefined
) => {
  await new Promise(r => setTimeout(r, 500));
  const io = getIO();
  try {
    const messageToUpdate = await Message.findByPk(msg.key.id, {
      include: [
        "contact",
        {
          model: Message,
          as: "quotedMsg",
          include: ["contact"]
        }
      ]
    });

    if (!messageToUpdate) return;
    await messageToUpdate.update({ ack: chat });
    io.to(messageToUpdate.ticketId.toString()).emit("appMessage", {
      action: "update",
      message: messageToUpdate
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error(`Error handling message ack. Err: ${err}`);
  }
};

const filterMessages = (msg: WAMessage): boolean => {
  if (msg.message?.protocolMessage) return false;

  if (
    [
      WAMessageStubType.REVOKE,
      WAMessageStubType.E2E_DEVICE_CHANGED,
      WAMessageStubType.E2E_IDENTITY_CHANGED,
      WAMessageStubType.CIPHERTEXT
    ].includes(msg.messageStubType as WAMessageStubType)
  )
    return false;

  return true;
};

const wbotMessageListener = async (wbot: Session): Promise<void> => {
  try {
    wbot.ev.on("messages.upsert", async (messageUpsert: ImessageUpsert) => {
      const messages = messageUpsert.messages
        .filter(filterMessages)
        .map(msg => msg);

      if (!messages) return;

      messages.forEach(async (message: proto.IWebMessageInfo) => {
        if (
          wbot.type === "md" &&
          !message.key.fromMe &&
          messageUpsert.type === "notify"
        ) {
          (wbot as WASocket)!.readMessages([message.key]);
        }
        // //console.log(JSON.stringify(message));
        handleMessage(message, wbot);
      });
    });

    wbot.ev.on("messages.update", (messageUpdate: WAMessageUpdate[]) => {
      if (messageUpdate.length === 0) return;
      messageUpdate.forEach(async (message: WAMessageUpdate) => {
        handleMsgAck(message, message.update.status);
      });
    });

    wbot.ev.on("messages.set", async (messageSet: IMessage) => {
      messageSet.messages.filter(filterMessages).map(msg => msg);
    });
  } catch (error) {
    Sentry.captureException(error);
    logger.error(`Error handling wbot message listener. Err: ${error}`);
  }
};

export { wbotMessageListener, handleMessage };
