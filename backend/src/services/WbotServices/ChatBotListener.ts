import { AnyWASocket, proto } from "@adiwajshing/baileys";
import util from 'util';
import Contact from "../../models/Contact";
import Ticket from "../../models/Ticket";
import { Store } from "../../libs/store";
import { debounce } from "../../helpers/Debounce";
import { getBodyMessage, verifyMessage } from "./wbotMessageListener";
import ShowDialogChatBotsServices from "../DialogChatBotsServices/ShowDialogChatBotsServices";
import ShowQueueService from "../QueueService/ShowQueueService";
import ShowChatBotServices from "../ChatBotServices/ShowChatBotServices";
import DeleteDialogChatBotsServices from "../DialogChatBotsServices/DeleteDialogChatBotsServices";
import ShowChatBotByChatbotIdServices from "../ChatBotServices/ShowChatBotByChatbotIdServices";
import CreateDialogChatBotsServices from "../DialogChatBotsServices/CreateDialogChatBotsServices";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import formatBody from "../../helpers/Mustache";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import Chatbot from "../../models/Chatbot";
import User from "../../models/User";
import Setting from "../../models/Setting";
import Queue from "../../models/Queue";

const puppeteer = require('puppeteer');
const fs = require('fs')
var axios = require('axios');

type Session = AnyWASocket & {
  id?: number;
  store?: Store;
};

const isNumeric = (value: string) => /^-?\d+$/.test(value);

export const deleteAndCreateDialogStage = async (
  contact: Contact,
  chatbotId: number,
  ticket: Ticket
) => {
  try {
    await DeleteDialogChatBotsServices(contact.id);
    const bots = await ShowChatBotByChatbotIdServices(chatbotId);
    if (!bots) {
      await ticket.update({ isBot: false });
    }
    return await CreateDialogChatBotsServices({
      awaiting: 1,
      contactId: contact.id,
      chatbotId,
      queueId: bots.queueId
    });
  } catch (error) {
    await ticket.update({ isBot: false });
  }
};


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

const sendMessage = async (
  wbot: Session,
  contact: Contact,
  ticket: Ticket,
  body: string
) => {
  await wbot.presenceSubscribe(`${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
  await sleep(1500)
  await wbot.sendPresenceUpdate('composing', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
  await sleep(1000)
  await wbot.sendPresenceUpdate('paused', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
  const sentMessage = await wbot.sendMessage(
    `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
    {
      text: formatBody(body, contact)
    }
  );
  verifyMessage(sentMessage, ticket, contact);
};

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
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, {
        document: url ? { url } : fs.readFileSync(`public/temp/${caption}-${makeid(10)}`),
        fileName: caption,
        caption: caption,
        mimetype: 'application/pdf'
      }
    );
  } catch (error) {
    sentMessage = await wbot.sendMessage(
      `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, {
        text: formatBody('Não consegui enviar o PDF, tente novamente!', contact)
      }
    );
  }
  verifyMessage(sentMessage, ticket, contact);
};

const sendMessageImage = async (
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
        image: url ? { url } : fs.readFileSync(`public/temp/${caption}-${makeid(10)}`),
        fileName: caption,
        caption: caption,
        mimetype: 'image/jpeg'
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

const sendDialog = async (
  choosenQueue: Chatbot,
  wbot: Session,
  contact: Contact,
  ticket: Ticket
) => {
  const showChatBots = await ShowChatBotServices(choosenQueue.id);
  if (showChatBots.options) {

    const buttonActive = await Setting.findOne({
      where: {
        key: "chatBotType"
      }
    });

    const botText = async () => {
      let options = "";

      showChatBots.options.forEach((option, index) => {
        options += `*${index + 1}* - ${option.name}\n`;
      });

      const optionsBack =
        options.length > 0
          ? `${options}\n*#* Voltar para o menu principal`
          : options;

      if (options.length > 0) {
        const body = `\u200e${choosenQueue.greetingMessage}\n\n${optionsBack}`;
        const sendOption = await sendMessage(wbot, contact, ticket, body);
        return sendOption;
      }

      const body = `\u200e${choosenQueue.greetingMessage}`;
      const send = await sendMessage(wbot, contact, ticket, body);
      return send;
    };

    const botButton = async () => {
      const buttons = [];
      showChatBots.options.forEach((option, index) => {
        buttons.push({
          buttonId: `${index + 1}`,
          buttonText: { displayText: option.name },
          type: 1
        });
      });

      if (buttons.length > 0) {

      const buttonMessage = {
        text: `\u200e${choosenQueue.greetingMessage}`,
        buttons,
        headerType: 1
      };

      const send = await wbot.sendMessage(
        `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,
        buttonMessage
      );
      await wbot.presenceSubscribe(`${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
      await sleep(1500)
      await wbot.sendPresenceUpdate('composing', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
      await sleep(1000)
      await wbot.sendPresenceUpdate('paused', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
      await verifyMessage(send, ticket, contact);

      return send;
      }

      const body = `\u200e${choosenQueue.greetingMessage}`;
      const send = await sendMessage(wbot, contact, ticket, body);

      return send;

    };

    const botList = async () => {
      const sectionsRows = [];
      showChatBots.options.forEach((queue, index) => {
        sectionsRows.push({
          title: queue.name,
          rowId: `${index + 1}`
        });
      });

      if (sectionsRows.length > 0) {
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
        await wbot.presenceSubscribe(`${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
        await sleep(1500)
        await wbot.sendPresenceUpdate('composing', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
        await sleep(1000)
        await wbot.sendPresenceUpdate('paused', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
        await verifyMessage(sendMsg, ticket, contact);

        return sendMsg;
      }

      const body = `\u200e${choosenQueue.greetingMessage}`;
      const send = await sendMessage(wbot, contact, ticket, body);

      return send;
    };

    if (buttonActive.value === "text") {
      return await botText();
    }

    if (buttonActive.value === "button" && showChatBots.options.length > 4) {
      return await botText();
    }

    if (buttonActive.value === "button" && showChatBots.options.length <= 4) {
      return await botButton();
    }

    if (buttonActive.value === "list") {
      return await botList();
    }
  }
};

const backToMainMenu = async (
  wbot: Session,
  contact: Contact,
  ticket: Ticket
) => {
  await UpdateTicketService({
    ticketData: { queueId: null },
    ticketId: ticket.id
  });

  const { queues, greetingMessage } = await ShowWhatsAppService(wbot.id!);

  const buttonActive = await Setting.findOne({
    where: {
      key: "chatBotType"
    }
  });

  const botText = async () => {
    let options = "";

    queues.forEach((option, index) => {
      options += `*${index + 1}* - ${option.name}\n`;
    });

    const body = formatBody(`\u200e${greetingMessage}\n\n${options}`, contact);
    await sendMessage(wbot, contact, ticket, body);

    const deleteDialog = await DeleteDialogChatBotsServices(contact.id);
    return deleteDialog;
  };

  const botButton = async () => {
    const buttons = [];
    queues.forEach((queue, index) => {
      buttons.push({
        buttonId: `${index + 1}`,
        buttonText: { displayText: queue.name },
        type: 1
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
    await wbot.presenceSubscribe(`${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
    await sleep(1500)
    await wbot.sendPresenceUpdate('composing', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
    await sleep(1000)
    await wbot.sendPresenceUpdate('paused', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
    await verifyMessage(sendMsg, ticket, contact);

    const deleteDialog = await DeleteDialogChatBotsServices(contact.id);
    return deleteDialog;
  };

  const botList = async () => {
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
    await wbot.presenceSubscribe(`${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
    await sleep(1500)
    await wbot.sendPresenceUpdate('composing', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
    await sleep(1000)
    await wbot.sendPresenceUpdate('paused', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
    await verifyMessage(sendMsg, ticket, contact);

    const deleteDialog = await DeleteDialogChatBotsServices(contact.id);
    return deleteDialog;
  };

  if (buttonActive.value === "text") {
    return await botText();
  }

  if (buttonActive.value === "button" && queues.length > 4) {
    return await botText();
  }

  if (buttonActive.value === "button" && queues.length <= 4) {
    return await botButton();
  }

  if (buttonActive.value === "list") {
    return await botList();
  }
};

export const sayChatbot = async (
  queueId: number,
  wbot: Session,
  ticket: Ticket,
  contact: Contact,
  msg: proto.IWebMessageInfo
): Promise<any> => {
  const selectedOption =
    msg?.message?.buttonsResponseMessage?.selectedButtonId ||
    msg?.message?.listResponseMessage?.singleSelectReply.selectedRowId ||
    getBodyMessage(msg);
    //console.log('Selecionado a opção: ', selectedOption);

  if (!queueId && selectedOption && msg.key.fromMe) return;

  const getStageBot = await ShowDialogChatBotsServices(contact.id);

  let cpfcnpj
  cpfcnpj = selectedOption;
  cpfcnpj = cpfcnpj.replace(/\./g, '');
  cpfcnpj = cpfcnpj.replace('-', '')
  cpfcnpj = cpfcnpj.replace('/', '')
  cpfcnpj = cpfcnpj.replace(' ', '')
  cpfcnpj = cpfcnpj.replace(',', '')

  const asaastoken = await Setting.findOne({
    where: {
      key: "tokenasaas"
    }
  });

  const ixcapikey = await Setting.findOne({
    where: {
      key: "tokenixc"
    }
  });
  const urlixcdb = await Setting.findOne({
    where: {
      key: "ipixc"
    }
  });

  const choosenQueueName = await Queue.findOne({
    where: {
      id: queueId
    }
  });

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

  let urlmkauth = ipmkauth.value
  let url = `${urlmkauth}/api/`;
  const Client_Id = clientidmkauth.value
  const Client_Secret = clientesecretmkauth.value
  let bufferObj = Buffer.from(ixcapikey.value, "utf8");
  let ixckeybase64 = bufferObj.toString("base64");
  let urlixc = urlixcdb.value
  let asaastk = asaastoken.value

  const cnpj_cpf = selectedOption;
  const filaescolhida = choosenQueueName.name

  let numberCPFCNPJ = cpfcnpj;
  if (filaescolhida === "2ª Via de Boleto" || filaescolhida === "2 Via de Boleto") {
    if (asaastoken.value !== "") {
      if (isNumeric(numberCPFCNPJ) === true) {
        if (cpfcnpj.length > 2) {
          const isCPFCNPJ = validaCpfCnpj(numberCPFCNPJ)
          if (isCPFCNPJ) {
            const body = `Aguarde! Estamos consultando na base de dados!`;
            try {
              await sleep(2000)
              await sendMessage(wbot, contact, ticket, body);
            } catch (error) {
              //console.log('Não consegui enviar a mensagem!')
            }
            var optionsc = {
              method: 'GET',
              url: 'https://www.asaas.com/api/v3/customers',
              params: {cpfCnpj: numberCPFCNPJ},
              headers: {
                'Content-Type': 'application/json',
                access_token: asaastk
              }
            };
            
            axios.request(optionsc).then(async function (response) {
              let nome;
              let id_cliente;
              let totalCount;
  
              nome = response?.data?.data[0]?.name;
              id_cliente = response?.data?.data[0]?.id;
              totalCount = response?.data?.totalCount;
              
              if (totalCount === 0) {
                  const body = `Cadastro não localizado! *CPF/CNPJ* incorreto ou inválido. Tenta novamente!`;
                  await sleep(2000)
                  await sendMessage(wbot, contact, ticket, body);           
              } else {
  
                const body = `Localizei seu Cadastro! \n*${nome}* só mais um instante por favor!`;
                await sleep(2000)
                await sendMessage(wbot, contact, ticket, body);  
                var optionsListpaymentOVERDUE = {
                  method: 'GET',
                  url: 'https://www.asaas.com/api/v3/payments',
                  params: {customer: id_cliente, status: 'OVERDUE'},
                  headers: {
                    'Content-Type': 'application/json',
                    access_token: asaastk
                  }
                };
                
                axios.request(optionsListpaymentOVERDUE).then(async function (response) {
                  let totalCount_overdue;
                  totalCount_overdue = response?.data?.totalCount;
  
                  if (totalCount_overdue === 0) {
                 
                    const body = `Você não tem nenhuma fatura vencida! \nVou te enviar a proxima fatura. Por favor aguarde!`;
                    await sleep(2000)
                    await sendMessage(wbot, contact, ticket, body); 
                    var optionsPENDING = {
                      method: 'GET',
                      url: 'https://www.asaas.com/api/v3/payments',
                      params: {customer: id_cliente, status: 'PENDING'},
                      headers: {
                        'Content-Type': 'application/json',
                        access_token: asaastk
                      }
                    };
                    
                    axios.request(optionsPENDING).then(async function (response) {
                      function sortfunction(a, b){
                        return a.dueDate.localeCompare(b.dueDate);
                      }
                      const ordenado = response?.data?.data.sort(sortfunction);
                      let id_payment_pending;
                      let value_pending;
                      let description_pending;
                      let invoiceUrl_pending;
                      let dueDate_pending;
                      let invoiceNumber_pending;
                      let totalCount_pending;
                      let value_pending_corrigida;
                      let dueDate_pending_corrigida;
      
                      id_payment_pending = ordenado[0]?.id;
                      value_pending = ordenado[0]?.value;
                      description_pending = ordenado[0]?.description;
                      invoiceUrl_pending = ordenado[0]?.invoiceUrl;
                      dueDate_pending = ordenado[0]?.dueDate;
                      invoiceNumber_pending = ordenado[0]?.invoiceNumber;
                      totalCount_pending = response?.data?.totalCount;
                      
                      dueDate_pending_corrigida = dueDate_pending?.split('-')?.reverse()?.join('/');
                      value_pending_corrigida = value_pending.toLocaleString('pt-br',{style: 'currency', currency: 'BRL'});
  
                      const bodyBoleto = `Segue a segunda-via da sua Fatura!\n\n*Fatura:* ${invoiceNumber_pending}\n*Nome:* ${nome}\n*Valor:* R$ ${value_pending_corrigida}\n*Data Vencimento:* ${dueDate_pending_corrigida}\n*Descrição:*\n${description_pending}\n*Link:* ${invoiceUrl_pending}`
                       await sleep(2000)
                      await sendMessage(wbot, contact, ticket, bodyBoleto);
                    //GET DADOS PIX
                    var optionsGetPIX = {
                      method: 'GET',
                      url: `https://www.asaas.com/api/v3/payments/${id_payment_pending}/pixQrCode`,
                      headers: {
                        'Content-Type': 'application/json',
                        access_token: asaastk
                      }
                    };
                    
                    axios.request(optionsGetPIX).then(async function (response) {
                      let success;
                      let payload;
  
                      success = response?.data?.success;
                      payload = response?.data?.payload;
                     
                  if (success === true) {
                          const bodyPixCP =  `Este é o *PIX Copia e Cola*`;
                          await sleep(2000)
                          await sendMessage(wbot, contact, ticket, bodyPixCP);   
                          await sleep(2000)
                          await sendMessage(wbot, contact, ticket, payload); 
                          let linkBoleto = `https://chart.googleapis.com/chart?cht=qr&chs=500x500&chld=L|0&chl=${payload}`
                          const nomePDF = ``
                          await sleep(2000)
                          await sendMessageImage(wbot, contact, ticket, linkBoleto, nomePDF)    
                          console.log("700")
                          console.log(id_payment_pending)                      
                          var optionsBoletopend = {
                            method: 'GET',
                            url: `https://www.asaas.com/api/v3/payments/${id_payment_pending}/identificationField`,
                            headers: {
                              'Content-Type': 'application/json',
                              access_token: asaastk
                            }
                          };
                          
                          axios.request(optionsBoletopend).then(async function (response) {
                            console.log(response.data)
                            console.log("711")
                            let codigo_barras 
                            codigo_barras = response.data.identificationField;
                            console.log(id_payment_pending)
                            if(response.data?.errors !== 'invalid_action') {
                              console.log("717")
                              const bodycodigo = `Este é o *Código de Barras*!`;
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodycodigo);  
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, codigo_barras); 
                              const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodyfinaliza);
                                const ticketUpdateAgent = {
                                  ticketData: {
                                    status: "closed"
                                  },
                                  ticketId: ticket.id
                                };
                                await sleep(2000) 
                                await UpdateTicketService(ticketUpdateAgent);  
                            } else {
                              console.log("735")
                              const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodyfinaliza);
                                const ticketUpdateAgent = {
                                  ticketData: {
                                    status: "closed"
                                  },
                                  ticketId: ticket.id
                                };
                                await sleep(2000) 
                                await UpdateTicketService(ticketUpdateAgent);  
                            }
   
                          }).catch(async function (error) {
                            console.log("nao tem boleto")
                            const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                            await sleep(2000)
                            await sendMessage(wbot, contact, ticket, bodyfinaliza);
                              const ticketUpdateAgent = {
                                ticketData: {
                                  status: "closed"
                                },
                                ticketId: ticket.id
                              };
                              await sleep(2000) 
                              await UpdateTicketService(ticketUpdateAgent);  
                          });                               
                  }
           
                    }).catch(async function (error) {
                      const body = `*Opss!!!!*\nOcorreu um erro! Digite *#* e fale com um *Atendente*!`;
                      await sleep(2000)
                      await sendMessage(wbot, contact, ticket, body);  
                    });    
               
  
  /*                         const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                          await sleep(2000)
                          await sendMessage(wbot, contact, ticket, bodyfinaliza);
                            const ticketUpdateAgent = {
                              ticketData: {
                                status: "closed"
                              },
                              ticketId: ticket.id
                            };
                            await sleep(2000) 
                            await UpdateTicketService(ticketUpdateAgent);      */
                    }).catch(async function (error) {
                      const body = `*Opss!!!!*\nOcorreu um erro! Digite *#* e fale com um *Atendente*!`;
                      await sleep(2000)
                      await sendMessage(wbot, contact, ticket, body);  
                    });              
                  } else {
                    let id_payment_overdue;
                    let value_overdue;
                    let description_overdue;
                    let invoiceUrl_overdue;
                    let dueDate_overdue;
                    let invoiceNumber_overdue;
                    
                    let value_overdue_corrigida;
                    let dueDate_overdue_corrigida;
    
                    id_payment_overdue = response?.data?.data[0]?.id;
                    value_overdue = response?.data?.data[0]?.value;
                    description_overdue = response?.data?.data[0]?.description;
                    invoiceUrl_overdue = response?.data?.data[0]?.invoiceUrl;
                    dueDate_overdue = response?.data?.data[0]?.dueDate;
                    invoiceNumber_overdue = response?.data?.data[0]?.invoiceNumber;
                    
    
                    dueDate_overdue_corrigida = dueDate_overdue?.split('-')?.reverse()?.join('/');
                    value_overdue_corrigida = value_overdue.toLocaleString('pt-br',{style: 'currency', currency: 'BRL'});   
                    const body = `Você tem *${totalCount_overdue}* fatura(s) vencidada(s)! \nVou te enviar. Por favor aguarde!`;
                    await sleep(2000)
                    await sendMessage(wbot, contact, ticket, body);                   
                    const bodyBoleto = `Segue a segunda-via da sua Fatura!\n\n*Fatura:* ${invoiceNumber_overdue}\n*Nome:* ${nome}\n*Valor:* R$ ${value_overdue_corrigida}\n*Data Vencimento:* ${dueDate_overdue_corrigida}\n*Descrição:*\n${description_overdue}\n*Link:* ${invoiceUrl_overdue}`
                    await sleep(2000)
                    await sendMessage(wbot, contact, ticket, bodyBoleto);
                    //GET DADOS PIX
                    var optionsGetPIX = {
                      method: 'GET',
                      url: `https://www.asaas.com/api/v3/payments/${id_payment_overdue}/pixQrCode`,
                      headers: {
                        'Content-Type': 'application/json',
                        access_token: asaastk
                      }
                    };
                    
                    axios.request(optionsGetPIX).then(async function (response) {
                      let success;
                      let payload;
  
                      success = response?.data?.success;
                      payload = response?.data?.payload;
                     
                  if (success === true) {
                          const bodyPixCP =  `Este é o *PIX Copia e Cola*`;
                          await sleep(2000)
                          await sendMessage(wbot, contact, ticket, bodyPixCP);   
                          await sleep(2000)
                          await sendMessage(wbot, contact, ticket, payload); 
                          let linkBoleto = `https://chart.googleapis.com/chart?cht=qr&chs=500x500&chld=L|0&chl=${payload}`
                          const nomePDF = ``
                          await sleep(2000)
                          await sendMessageImage(wbot, contact, ticket, linkBoleto, nomePDF)  
                          var optionsBoleto = {
                            method: 'GET',
                            url: `https://www.asaas.com/api/v3/payments/${id_payment_overdue}/identificationField`,
                            headers: {
                              'Content-Type': 'application/json',
                              access_token: asaastk
                            }
                          };
                          
                          axios.request(optionsBoleto).then(async function (response) {
                            console.log(id_payment_overdue)
                            let codigo_barras 
                            codigo_barras = response.data.identificationField;
        
                            if(response.data?.errors?.code !== 'invalid_action') {
                              const bodycodigo = `Este é o *Código de Barras*!`;
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodycodigo);  
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, codigo_barras); 
                              const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodyfinaliza);
                                const ticketUpdateAgent = {
                                  ticketData: {
                                    status: "closed"
                                  },
                                  ticketId: ticket.id
                                };
                                await sleep(2000) 
                                await UpdateTicketService(ticketUpdateAgent);        
                            }else {
                              const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodyfinaliza);
                                const ticketUpdateAgent = {
                                  ticketData: {
                                    status: "closed"
                                  },
                                  ticketId: ticket.id
                                };
                                await sleep(2000) 
                                await UpdateTicketService(ticketUpdateAgent);        
                            }
  
                          }).catch(function (error) {
                            //console.error(error);
                          });                             
        
                  }
                    }).catch(function (error) {
  
                    });                  
                    
                  }
  
                }).catch(async function (error) {
                  const body = `*Opss!!!!*\nOcorreu um erro! Digite *#* e fale com um *Atendente*!`;
                  await sleep(2000)
                  await sendMessage(wbot, contact, ticket, body);  
                });            
              }
            }).catch(async function (error) {
              const body = `*Opss!!!!*\nOcorreu um erro! Digite *#* e fale com um *Atendente*!`;
                await sleep(2000)
                await sendMessage(wbot, contact, ticket, body);  
            });
          }
        }
      }
     }
  
    if (ixcapikey.value != "" && urlixcdb.value != "") {
    if (isNumeric(numberCPFCNPJ) === true) {
      if (cpfcnpj.length > 2) {
        const isCPFCNPJ = validaCpfCnpj(numberCPFCNPJ)
        if (isCPFCNPJ) {
          if (numberCPFCNPJ.length <= 11) {
            numberCPFCNPJ = numberCPFCNPJ.replace(/(\d{3})(\d)/, "$1.$2")
            numberCPFCNPJ = numberCPFCNPJ.replace(/(\d{3})(\d)/, "$1.$2")
            numberCPFCNPJ = numberCPFCNPJ.replace(/(\d{3})(\d{1,2})$/, "$1-$2")
          } else {
            numberCPFCNPJ = numberCPFCNPJ.replace(/^(\d{2})(\d)/, "$1.$2")
            numberCPFCNPJ = numberCPFCNPJ.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
            numberCPFCNPJ = numberCPFCNPJ.replace(/\.(\d{3})(\d)/, ".$1/$2")
            numberCPFCNPJ = numberCPFCNPJ.replace(/(\d{4})(\d)/, "$1-$2")
          }
           //const token = await CheckSettingsHelper("OBTEM O TOKEN DO BANCO (dei insert na tabela settings)")
           const body = `Aguarde! Estamos consultando na base de dados!`;
          try {
            await sleep(2000)
            await sendMessage(wbot, contact, ticket, body);
          } catch (error) {
            //console.log('Não consegui enviar a mensagem!')
          }
          var options = {
            method: 'GET',
            url: `${urlixc}/webservice/v1/cliente`,
            headers: {
              ixcsoft: 'listar',
              Authorization: `Basic ${ixckeybase64}`
            },
            data: {
              qtype: 'cliente.cnpj_cpf',
              query: numberCPFCNPJ,
              oper: '=',
              page: '1',
              rp: '1',
              sortname: 'cliente.cnpj_cpf',
              sortorder: 'asc'
            }
          };
          
          axios.request(options).then(async function (response) {
            //console.log(response.data)
            if(response.data.type === 'error') {
              const body = `*Opss!!!!*\nOcorreu um erro! Digite *#* e fale com um *Atendente*!`;
                await sleep(2000)
                await sendMessage(wbot, contact, ticket, body);           
           } if (response.data.total === 0) {
              const body = `Cadastro não localizado! *CPF/CNPJ* incorreto ou inválido. Tenta novamente!`;
              try {
                await sleep(2000)
                await sendMessage(wbot, contact, ticket, body);
              } catch (error) {
                //console.log('Não consegui enviar a mensagem!')
              }                 
              }  else { 
  
            let nome;
            let id;
            let type;
  
            nome = response.data?.registros[0]?.razao
            id = response.data?.registros[0]?.id
            type = response.data?.type
            
  
            const body = `Localizei seu Cadastro! \n*${nome}* só mais um instante por favor!`;
                         await sleep(2000)
                         await sendMessage(wbot, contact, ticket, body);   
                         var boleto = {
                          method: 'GET',
                          url: `${urlixc}/webservice/v1/fn_areceber`,
                          headers: {
                            ixcsoft: 'listar',
                            Authorization: `Basic ${ixckeybase64}`
                          },
                          data: {
                            qtype: 'fn_areceber.id_cliente',
                            query: id,
                            oper: '=',
                            page: '1',
                            rp: '1',
                            sortname: 'fn_areceber.data_vencimento',
                            sortorder: 'asc',
                            grid_param: '[{"TB":"fn_areceber.status", "OP" : "=", "P" : "A"}]'
                          }
                        };         
                        axios.request(boleto).then(async function (response) {
  
  
  
                          let gateway_link;
                          let valor;
                          let datavenc;
                          let datavencCorrigida;
                          let valorCorrigido;
                          let linha_digitavel;
                          let impresso;
                          let idboleto;
  
                          idboleto = response.data?.registros[0]?.id
                          gateway_link = response.data?.registros[0]?.gateway_link
                          valor = response.data?.registros[0]?.valor 
                          datavenc = response.data?.registros[0]?.data_vencimento 
                          linha_digitavel = response.data?.registros[0]?.linha_digitavel 
                          impresso = response.data?.registros[0]?.impresso 
                          valorCorrigido = valor.replace(".", ",");
                          datavencCorrigida = datavenc.split('-').reverse().join('/')
  
                          //console.log(response.data?.registros[0])
                          //INFORMAÇÕES BOLETO
                          const bodyBoleto = `Segue a segunda-via da sua Fatura!\n\n*Fatura:* ${idboleto}\n*Nome:* ${nome}\n*Valor:* R$ ${valorCorrigido}\n*Data Vencimento:* ${datavencCorrigida}\n\nVou mandar o *código de barras* na próxima mensagem para ficar mais fácil para você copiar!`
                          //await sleep(2000)
                          //await sendMessage(wbot, contact, ticket, bodyBoleto);
                          //LINHA DIGITAVEL                    
                          if(impresso !== "S") {
                          //IMPRIME BOLETO PARA GERAR CODIGO BARRAS
                          var boletopdf = {
                            method: 'GET',
                            url: `${urlixc}/webservice/v1/get_boleto`,
                            headers: {
                              ixcsoft: 'listar',
                              Authorization: `Basic ${ixckeybase64}`
                            },
                            data: {
                              boletos: idboleto,
                              juro: 'N',
                              multa: 'N',
                              atualiza_boleto: 'N',
                              tipo_boleto: 'arquivo',
                              base64: 'S'
                            }
                          };
                          
                          axios.request(boletopdf).then(function (response) {
                            console.log("IMPRESSO");
                          }).catch(function (error) {
                            console.error(error);
                          });
                          }
  
                          //SE TIVER PIX ENVIA O PIX
                          var optionsPix = {
                            method: 'GET',
                            url: `${urlixc}/webservice/v1/get_pix`,
                            headers: {
                              ixcsoft: 'listar',
                              Authorization: `Basic ${ixckeybase64}`
                            },
                            data: {id_areceber: idboleto}
                          };
                          
                          axios.request(optionsPix).then(async function (response) {
                            let tipo;
                            let pix;
  
                            tipo = response.data?.type;
                            pix = response.data?.pix?.qrCode?.qrcode; 
                            if (tipo === 'success'){
                              const bodyBoletoPix = `Segue a segunda-via da sua Fatura!\n\n*Fatura:* ${idboleto}\n*Nome:* ${nome}\n*Valor:* R$ ${valorCorrigido}\n*Data Vencimento:* ${datavencCorrigida}
  \n\nVou te enviar o *Código de Barras* e o *PIX* basta clicar em qual você quer utlizar que já vai copiar! Depois basta realizar o pagamento no seu banco`
                              await sendMessage(wbot, contact, ticket, bodyBoletoPix);
                              const body_linhadigitavel = "Este é o *Código de Barras*"
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, body_linhadigitavel);
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, linha_digitavel);
                              const body_pix = "Este é o *PIX Copia e Cola*"
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, body_pix);
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, pix);
                              const body_pixqr = "QR CODE do *PIX*"
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, body_pixqr);
                              let linkBoleto = `https://chart.googleapis.com/chart?cht=qr&chs=500x500&chld=L|0&chl=${pix}`
                              const nomePDF = ``
                              await sleep(2000)
                              await sendMessageImage(wbot, contact, ticket, linkBoleto, nomePDF)                            
  /*                             const templateButtonsCodigo = [
                                {index: 1, 
                                  urlButton: {
                                    displayText: 'Copiar', 
                                    url: `https://www.whatsapp.com/otp/copy/${linha_digitavel}`
                                  },
                                },
                              ]
                              const templateButtonsPix = [
                                {index: 1, 
                                  urlButton: {
                                    displayText: 'Copiar', 
                                    url: `https://www.whatsapp.com/otp/copy/${pix}`
  
                                  }
                                }
                              ]
                         
                              const debouncedSentMessage = debounce(
                                async () => {
                                  await wbot.presenceSubscribe(`${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
                                  await sleep(1500)
                                  await wbot.sendPresenceUpdate('composing', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
                                  await sleep(1000)
                                  await wbot.sendPresenceUpdate('paused', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
                                  const sentMessage = await wbot.sendMessage(`${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, {
                                      text: "Aqui tem o *Cod. de Barras*",
                                      templateButtons: templateButtonsCodigo, 
                                    }
                                  );  
                                  await wbot.presenceSubscribe(`${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
                                  await sleep(1500)
                                  await wbot.sendPresenceUpdate('composing', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
                                  await sleep(1000)
                                  await wbot.sendPresenceUpdate('paused', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
                                  const sentMessage1 = await wbot.sendMessage(`${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`, {
                                    text: "Aqui tem o *PIX*",
                                    templateButtons: templateButtonsPix, 
                                  }
                                );   
                                await wbot.presenceSubscribe(`${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
                                await sleep(1500)
                                await wbot.sendPresenceUpdate('composing', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)
                                await sleep(1000)
                                await wbot.sendPresenceUpdate('paused', `${contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`,)                                                           
                                await verifyMessage(sentMessage1, ticket, contact);
                                  //await verifyMessage(sentMessage1, ticket, contact);
                                },
                                1000,
                                ticket.id
                              );
                              debouncedSentMessage(); */
                                  ///VE SE ESTA BLOQUEADO PARA LIBERAR!
                                var optionscontrato = {
                                  method: 'POST',
                                  url: `${urlixc}/webservice/v1/cliente_contrato`,
                                  headers: {
                                    ixcsoft: 'listar',
                                    Authorization: `Basic ${ixckeybase64}`
                                  },
                                  data: {
                                    qtype: 'cliente_contrato.id_cliente',
                                    query: id,
                                    oper: '=',
                                    page: '1',
                                    rp: '1',
                                    sortname: 'cliente_contrato.id',
                                    sortorder: 'asc'
                                  }
                                };
                                axios.request(optionscontrato).then(async function (response) {
                                  let status_internet;
                                  let id_contrato;
                                  status_internet = response.data?.registros[0]?.status_internet; 
                                  id_contrato = response.data?.registros[0]?.id; 
                                  if(status_internet !== 'A'){
                                    const bodyPdf = `*${nome}* vi tambem que a sua conexão esta bloqueada! Vou desbloquear para você.`
                                    await sleep(2000)
                                    await sendMessage(wbot, contact, ticket, bodyPdf);
                                    const bodyqrcode = `Estou liberando seu acesso. Por favor aguarde!`
                                    await sleep(2000)
                                    await sendMessage(wbot, contact, ticket, bodyqrcode);
                                    //REALIZANDO O DESBLOQUEIO   
                                    var optionsdesbloqeuio = {
                                      method: 'POST',
                                      url: `${urlixc}/webservice/v1/desbloqueio_confianca`,
                                      headers: {
                                        Authorization: `Basic ${ixckeybase64}`
                                      },
                                      data: {id: id_contrato}
                                    };
                                    
                                    axios.request(optionsdesbloqeuio).then(async function (response) {
                                      let tipo;
                                      let mensagem;
                                      tipo = response.data?.tipo; 
                                      mensagem = response.data?.mensagem; 
                                      if(tipo === 'sucesso') {
                                          //DESCONECTANDO O CLIENTE PARA VOLTAR O ACESSO
                                          var optionsRadius = {
                                            method: 'GET',
                                            url: `${urlixc}/webservice/v1/radusuarios`,
                                            headers: {
                                              ixcsoft: 'listar',
                                              Authorization: `Basic ${ixckeybase64}`
                                            },
                                            data: {
                                              qtype: 'radusuarios.id_cliente',
                                              query: id,
                                              oper: '=',
                                              page: '1',
                                              rp: '1',
                                              sortname: 'radusuarios.id',
                                              sortorder: 'asc'
                                            }
                                          };
                                    
                                          axios.request(optionsRadius).then(async function (response) {
                                            let tipo;
                                            tipo = response.data?.type; 
                                            if(tipo === 'success') {
                                              await sleep(2000)
                                              await sendMessage(wbot, contact, ticket, mensagem);   
                                              const bodyPdf =  `Fiz os procedimentos de liberação! Agora aguarde até 5 minutos e veja se sua conexão irá retornar! .\n\nCaso não tenha voltado, retorne o contato e fale com um atendente!`
                                              await sleep(2000)
                                              await sendMessage(wbot, contact, ticket, bodyPdf);
                                              const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                                              await sleep(2000)
                                              await sendMessage(wbot, contact, ticket, bodyfinaliza);
                                                const ticketUpdateAgent = {
                                                  ticketData: {
                                                    status: "closed"
                                                  },
                                                  ticketId: ticket.id
                                                };
                                                await sleep(2000) 
                                                await UpdateTicketService(ticketUpdateAgent);  
                                            } else {
                                                /* await sleep(2000)
                                                await sendMessage(wbot, contact, ticket, mensagem);   
                                                const bodyPdf =  `Vou precisar que você *retire* seu equipamento da tomada.\n\n*OBS: Somente retire da tomada.* \nAguarde 1 minuto e ligue novamente!`
                                                await sleep(2000)
                                                await sendMessage(wbot, contact, ticket, bodyPdf);
                                                const bodyqrcode = `Veja se seu acesso voltou! Caso não tenha voltado retorne o contato e fale com um atendente!`
                                                await sleep(2000)
                                                await sendMessage(wbot, contact, ticket, bodyqrcode);  
                                                const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                                                await sleep(2000)
                                                await sendMessage(wbot, contact, ticket, bodyfinaliza);
                                                  const ticketUpdateAgent = {
                                                    ticketData: {
                                                      status: "closed"
                                                    },
                                                    ticketId: ticket.id
                                                  };
                                                  await sleep(2000) 
                                                  await UpdateTicketService(ticketUpdateAgent);   */
                                              }
                                            }).catch(function (error) {
                                              console.error(error);
                                            });
                                            //FIM DA DESCONEXÃO 
                                          } else {
                                            var msgerrolbieracao = response.data.mensagem
                                            const bodyerro = `Ops! Ocorreu um erro e nao consegui desbloquear`
                                            await sleep(2000)
                                            await sendMessage(wbot, contact, ticket, bodyerro);  
                                            await sleep(2000)
                                            await sendMessage(wbot, contact, ticket, msgerrolbieracao);  
                                            const bodyerroatendent = `Digite *#* para voltar o menu e fale com um atendente!`
                                            await sleep(2000)
                                            await sendMessage(wbot, contact, ticket, bodyerroatendent);  
                                        }
  
                                      }).catch(async function (error) {
                                        console.log('LINHA 738: ' + error)
                                        const bodyerro = `Ops! Ocorreu um erro digite *#* e fale com um atendente!`
                                        await sleep(2000)
                                        await sendMessage(wbot, contact, ticket, bodyerro);  
                                      });
                                    } else {
                                      const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                                      await sleep(8000)
                                      await sendMessage(wbot, contact, ticket, bodyfinaliza);
                                        const ticketUpdateAgent = {
                                          ticketData: {
                                            status: "closed"
                                          },
                                          ticketId: ticket.id
                                        };
                                        await sleep(2000) 
                                        await UpdateTicketService(ticketUpdateAgent); 
                                    }
  
                            //
                          }).catch(async function (error) {
                            console.log('LINHA 746: ' + error)
                            const bodyerro = `Ops! Ocorreu um erro digite *#* e fale com um atendente!`
                            await sleep(2000)
                            await sendMessage(wbot, contact, ticket, bodyerro);  
                          });
                          ///VE SE ESTA BLOQUEADO PARA LIBERAR!
                            } else {
                              const bodyBoleto = `Segue a segunda-via da sua Fatura!\n\n*Fatura:* ${idboleto}\n*Nome:* ${nome}\n*Valor:* R$ ${valorCorrigido}\n*Data Vencimento:* ${datavencCorrigida}\n\nBasta clicar aqui em baixo em código de barras para copiar, apos isto basta realizar o pagamento em seu banco!`
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodyBoleto);
                              const body = `Este é o *Codigo de Barras*`;
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, body);
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, linha_digitavel);
                          ///VE SE ESTA BLOQUEADO PARA LIBERAR!
                          var optionscontrato = {
                            method: 'POST',
                            url: `${urlixc}/webservice/v1/cliente_contrato`,
                            headers: {
                              ixcsoft: 'listar',
                              Authorization: `Basic ${ixckeybase64}`
                            },
                            data: {
                              qtype: 'cliente_contrato.id_cliente',
                              query: id,
                              oper: '=',
                              page: '1',
                              rp: '1',
                              sortname: 'cliente_contrato.id',
                              sortorder: 'asc'
                            }
                          };
                          axios.request(optionscontrato).then(async function (response) {
                            let status_internet;
                            let id_contrato;
                            status_internet = response.data?.registros[0]?.status_internet; 
                            id_contrato = response.data?.registros[0]?.id; 
                            if(status_internet !== 'A'){
                              const bodyPdf = `*${nome}* vi tambem que a sua conexão esta bloqueada! Vou desbloquear para você.`
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodyPdf);
                              const bodyqrcode = `Estou liberando seu acesso. Por favor aguarde!`
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodyqrcode);
                              //REALIZANDO O DESBLOQUEIO   
                              var optionsdesbloqeuio = {
                                method: 'POST',
                                url: `${urlixc}/webservice/v1/desbloqueio_confianca`,
                                headers: {
                                  Authorization: `Basic ${ixckeybase64}`
                                },
                                data: {id: id_contrato}
                              };
                              
                              axios.request(optionsdesbloqeuio).then(async function (response) {
                                let tipo;
                                let mensagem;
                                tipo = response.data?.tipo; 
                                mensagem = response.data?.mensagem; 
                                if(tipo === 'sucesso') {
                                    //DESCONECTANDO O CLIENTE PARA VOLTAR O ACESSO
                                    var optionsRadius = {
                                      method: 'GET',
                                      url: `${urlixc}/webservice/v1/radusuarios`,
                                      headers: {
                                        ixcsoft: 'listar',
                                        Authorization: `Basic ${ixckeybase64}`
                                      },
                                      data: {
                                        qtype: 'radusuarios.id_cliente',
                                        query: id,
                                        oper: '=',
                                        page: '1',
                                        rp: '1',
                                        sortname: 'radusuarios.id',
                                        sortorder: 'asc'
                                      }
                                    };
                                    
                                    axios.request(optionsRadius).then(async function (response) {
                                      let tipo;
                                      tipo = response.data?.type; 
                                      if(tipo === 'success') {
                                        await sleep(2000)
                                        await sendMessage(wbot, contact, ticket, mensagem);   
                                        const bodyPdf =  `Fiz os procedimentos de liberação! Agora aguarde até 5 minutos e veja se sua conexão irá retornar! .\n\nCaso não tenha voltado, retorne o contato e fale com um atendente!`
                                        await sleep(2000)
                                        await sendMessage(wbot, contact, ticket, bodyPdf);
                                        const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                                        await sleep(2000)
                                        await sendMessage(wbot, contact, ticket, bodyfinaliza);
                                          const ticketUpdateAgent = {
                                            ticketData: {
                                              status: "closed"
                                            },
                                            ticketId: ticket.id
                                          };
                                          await sleep(2000) 
                                          await UpdateTicketService(ticketUpdateAgent);  
                                      } else {
                                        await sleep(2000)
                                        await sendMessage(wbot, contact, ticket, mensagem);   
                                        const bodyPdf =  `Vou precisar que você *retire* seu equipamento da tomada.\n\n*OBS: Somente retire da tomada.* \nAguarde 1 minuto e ligue novamente!`
                                        await sleep(2000)
                                        await sendMessage(wbot, contact, ticket, bodyPdf);
                                        const bodyqrcode = `Veja se seu acesso voltou! Caso não tenha voltado retorne o contato e fale com um atendente!`
                                        await sleep(2000)
                                        await sendMessage(wbot, contact, ticket, bodyqrcode);  
                                        const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                                        await sleep(2000)
                                        await sendMessage(wbot, contact, ticket, bodyfinaliza);
                                          const ticketUpdateAgent = {
                                            ticketData: {
                                              status: "closed"
                                            },
                                            ticketId: ticket.id
                                          };
                                          await sleep(2000) 
                                          await UpdateTicketService(ticketUpdateAgent);  
                                      }
                                    }).catch(function (error) {
                                      console.error(error);
                                    });
                                    //FIM DA DESCONEXÃO 
                                  } else {
                                    console.log(response.data);
                                    const bodyerro = `Ops! Ocorreu um erro e nao consegui desbloquear! Digite *#* e fale com um atendente!`
                                    await sleep(2000)
                                    await sendMessage(wbot, contact, ticket, bodyerro);  
                                }
  
                              }).catch(async function (error) {
                                console.log('LINHA 738: ' + error)
                                const bodyerro = `Ops! Ocorreu um erro digite *#* e fale com um atendente!`
                                await sleep(2000)
                                await sendMessage(wbot, contact, ticket, bodyerro);  
                              });
                            } else {
                              const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodyfinaliza);
                                const ticketUpdateAgent = {
                                  ticketData: {
                                    status: "closed"
                                  },
                                  ticketId: ticket.id
                                };
                                await sleep(2000) 
                                await UpdateTicketService(ticketUpdateAgent); 
                            }
  
                            //
                          }).catch(async function (error) {
                            console.log('LINHA 746: ' + error)
                            const bodyerro = `Ops! Ocorreu um erro digite *#* e fale com um atendente!`
                            await sleep(2000)
                            await sendMessage(wbot, contact, ticket, bodyerro);  
                          });
                          ///VE SE ESTA BLOQUEADO PARA LIBERAR!                            
                            }
                          }).catch(function (error) {
                            console.error(error);
                          });
                          //FIM DO PÌX
  
                         
  
                        }).catch(function (error) {
                          console.error(error);
                        }); 
  
            }
  
          }).catch(async function (error) {
            const body = `*Opss!!!!*\nOcorreu um erro! Digite *#* e fale com um *Atendente*!`;
            await sleep(2000)
            await sendMessage(wbot, contact, ticket, body); 
          });
        } else {
            const body = `Este CPF/CNPJ não é válido!\n\nPor favor tente novamente!\nOu digite *#* para voltar ao *Menu Anterior*`;
            await sleep(2000)
            await sendMessage(wbot, contact, ticket, body);     
        }
      }    
    }
     } 
  
  if (ipmkauth.value != "" && clientidmkauth.value != "" && clientesecretmkauth.value != "") {
    if (isNumeric(numberCPFCNPJ) === true) {
      if (cpfcnpj.length > 2) {
        const isCPFCNPJ = validaCpfCnpj(numberCPFCNPJ)
        if (isCPFCNPJ) {
           const body = `Aguarde! Estamos consultando na base de dados!`;
          try {
            await sleep(2000)
            await sendMessage(wbot, contact, ticket, body);
          } catch (error) {
            console.log('Não consegui enviar a mensagem!')
          }
    
  
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
              console.log(`RESPONSE 544: ${response}`)
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
                    console.log('Não consegui enviar a mensagem!')
                  }                 
                } else {
                     let nome
                     let cpf_cnpj
                     let qrcode
                     let valor
                     let bloqueado
                     let linhadig
                     let uuid_cliente
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
                     bloqueado = response.data.dados_cliente.titulos.bloqueado
                     uuid_cliente = response.data.dados_cliente.titulos.uuid_cliente
                     qrcode = response.data.dados_cliente.titulos.qrcode
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
                            if(qrcode !== null ){
                              const bodyPdf = `Este é o *PIX COPIA E COLA*`
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodyPdf);
                              const bodyqrcode = `${qrcode}`
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodyqrcode);  
                              let linkBoleto = `https://chart.googleapis.com/chart?cht=qr&chs=500x500&chld=L|0&chl=${qrcode}`
                              const nomePDF = ``
                              await sleep(2000)
                              await sendMessageImage(wbot, contact, ticket, linkBoleto, nomePDF)   
                            }                       
                         const bodyPdf = `Agora vou te enviar o boleto em *PDF* caso você precise.`
                         await sleep(2000)
                         await sendMessage(wbot, contact, ticket, bodyPdf);
                         await sleep(2000)    
                                              //GERA O PDF                                    
                          const nomePDF = `Boleto-${nome}-${dia}-${mes}-${ano}.pdf`;
                          (async () => {
                            const browser = await puppeteer.launch({args: ['--no-sandbox']});
                            const page = await browser.newPage();
                            const website_url = `${urlmkauth}/boleto/21boleto.php?titulo=${titulo}`;
                            await page.goto(website_url, { waitUntil: 'networkidle0' });
                            await page.emulateMediaType('screen');
                            // Downlaod the PDF
                            const pdf = await page.pdf({
                              path: nomePDF,
                              printBackground: true,
                              format: 'A4',
                            });
                            await browser.close();
                            sendMessageLink(wbot, contact, ticket, nomePDF, nomePDF);
                          })();                      


                          if(bloqueado === 'sim' ){
                            const bodyPdf = `${nome} vi tambem que a sua conexão esta bloqueada! Vou desbloquear para você por *48 horas*.`
                            await sleep(2000)
                            await sendMessage(wbot, contact, ticket, bodyPdf);
                            const bodyqrcode = `Estou liberando seu acesso. Por favor aguarde!`
                            await sleep(2000)
                            await sendMessage(wbot, contact, ticket, bodyqrcode);   
                            var optionsdesbloq = {
                              method: 'GET',
                              url: `${urlmkauth}/api/cliente/desbloqueio/${uuid_cliente}`,
                              headers: {
                                Authorization: `Bearer ${jtw}`
                              }
                            };
                            axios.request(optionsdesbloq).then(async function (response) {
                              const bodyPdf =  `Pronto liberei! Vou precisar que você *retire* seu equipamento da tomada.\n\n*OBS: Somente retire da tomada.* \nAguarde 1 minuto e ligue novamente!`
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodyPdf);
                              const bodyqrcode = `Veja se seu acesso voltou! Caso nao tenha voltado retorne o contato e fale com um atendente!`
                              await sleep(2000)
                              await sendMessage(wbot, contact, ticket, bodyqrcode);  
                            }).catch(async function (error) {
                              const bodyfinaliza = `Opss! Algo de errado aconteceu! Digite *#* para voltar ao menu anterior e fale com um atendente!`
                              await sendMessage(wbot, contact, ticket, bodyfinaliza);
                            });  
                          } 
 
                      
                             
                          const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                          await sleep(12000)
                          await sendMessage(wbot, contact, ticket, bodyfinaliza);
                            const ticketUpdateAgent = {
                              ticketData: {
                                status: "closed"
                              },
                              ticketId: ticket.id
                            };
                            await sleep(2000) 
                            fs.unlink(nomePDF, function (err){
                              if (err) throw err;
                              //console.log(err);
                          })                           
                            await UpdateTicketService(ticketUpdateAgent); 
                       } catch (error) { 
                         console.log('11 Não consegui enviar a mensagem!')
                       }
               }})
               .catch(async function (error) {
                 try {
                   const bodyBoleto = `Não consegui encontrar seu cadastro.\n\nPor favor tente novamente!\nOu digite *#* para voltar ao *Menu Anterior*`
                   await sleep(2000)
                   await sendMessage(wbot, contact, ticket, bodyBoleto);
                 } catch (error) {
                   console.log('111 Não consegui enviar a mensagem!')
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

  if (filaescolhida === "Religue de Confiança" || filaescolhida === "Liberação em Confiança") {
    if (ixcapikey.value != "" && urlixcdb.value != "") {
      if (isNumeric(numberCPFCNPJ) === true) {
        if (cpfcnpj.length > 2) {
          const isCPFCNPJ = validaCpfCnpj(numberCPFCNPJ)
          if (isCPFCNPJ) {
            if (numberCPFCNPJ.length <= 11) {
              numberCPFCNPJ = numberCPFCNPJ.replace(/(\d{3})(\d)/, "$1.$2")
              numberCPFCNPJ = numberCPFCNPJ.replace(/(\d{3})(\d)/, "$1.$2")
              numberCPFCNPJ = numberCPFCNPJ.replace(/(\d{3})(\d{1,2})$/, "$1-$2")
            } else {
              numberCPFCNPJ = numberCPFCNPJ.replace(/^(\d{2})(\d)/, "$1.$2")
              numberCPFCNPJ = numberCPFCNPJ.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
              numberCPFCNPJ = numberCPFCNPJ.replace(/\.(\d{3})(\d)/, ".$1/$2")
              numberCPFCNPJ = numberCPFCNPJ.replace(/(\d{4})(\d)/, "$1-$2")
            }
             //const token = await CheckSettingsHelper("OBTEM O TOKEN DO BANCO (dei insert na tabela settings)")
             const body = `Aguarde! Estamos consultando na base de dados!`;
            try {
              await sleep(2000)
              await sendMessage(wbot, contact, ticket, body);
            } catch (error) {
              //console.log('Não consegui enviar a mensagem!')
            }
            var options = {
              method: 'GET',
              url: `${urlixc}/webservice/v1/cliente`,
              headers: {
                ixcsoft: 'listar',
                Authorization: `Basic ${ixckeybase64}`
              },
              data: {
                qtype: 'cliente.cnpj_cpf',
                query: numberCPFCNPJ,
                oper: '=',
                page: '1',
                rp: '1',
                sortname: 'cliente.cnpj_cpf',
                sortorder: 'asc'
              }
            };
            
            axios.request(options).then(async function (response) {
              //console.log(response.data)
              if(response.data.type === 'error') {
                const body = `*Opss!!!!*\nOcorreu um erro! Digite *#* e fale com um *Atendente*!`;
                  await sleep(2000)
                  await sendMessage(wbot, contact, ticket, body);           
             } if (response.data.total === 0) {
                const body = `Cadastro não localizado! *CPF/CNPJ* incorreto ou inválido. Tenta novamente!`;
                try {
                  await sleep(2000)
                  await sendMessage(wbot, contact, ticket, body);
                } catch (error) {
                  //console.log('Não consegui enviar a mensagem!')
                }                 
                }  else { 
    
              let nome;
              let id;
              let type;
    
              nome = response.data?.registros[0]?.razao
              id = response.data?.registros[0]?.id
              type = response.data?.type
              
    
              const body = `Localizei seu Cadastro! \n*${nome}* só mais um instante por favor!`;
                           await sleep(2000)
                           await sendMessage(wbot, contact, ticket, body);
                           ///VE SE ESTA BLOQUEADO PARA LIBERAR!
                           var optionscontrato = {
                           method: 'POST',
                           url: `${urlixc}/webservice/v1/cliente_contrato`,
                           headers: {
                           ixcsoft: 'listar',
                           Authorization: `Basic ${ixckeybase64}`
                           },
                           data: {
                           qtype: 'cliente_contrato.id_cliente',
                           query: id,
                           oper: '=',
                           page: '1',
                           rp: '1',
                           sortname: 'cliente_contrato.id',
                           sortorder: 'asc'
                           }
                           };
                           axios.request(optionscontrato).then(async function (response) {
                           let status_internet;
                           let id_contrato;
                           status_internet = response.data?.registros[0]?.status_internet; 
                           id_contrato = response.data?.registros[0]?.id; 
                           if(status_internet !== 'A'){
                           const bodyPdf = `*${nome}*  a sua conexão esta bloqueada! Vou desbloquear para você.`
                           await sleep(2000)
                           await sendMessage(wbot, contact, ticket, bodyPdf);
                           const bodyqrcode = `Estou liberando seu acesso. Por favor aguarde!`
                           await sleep(2000)
                           await sendMessage(wbot, contact, ticket, bodyqrcode);
                           //REALIZANDO O DESBLOQUEIO   
                           var optionsdesbloqeuio = {
                             method: 'POST',
                             url: `${urlixc}/webservice/v1/desbloqueio_confianca`,
                             headers: {
                               Authorization: `Basic ${ixckeybase64}`
                             },
                             data: {id: id_contrato}
                           };
                           
                           axios.request(optionsdesbloqeuio).then(async function (response) {
                             let tipo;
                             let mensagem;
                             tipo = response.data?.tipo; 
                             mensagem = response.data?.mensagem; 
                                if(tipo === 'sucesso') {
                                 //DESCONECTANDO O CLIENTE PARA VOLTAR O ACESSO
                                 var optionsRadius = {
                                   method: 'GET',
                                   url: `${urlixc}/webservice/v1/radusuarios`,
                                   headers: {
                                     ixcsoft: 'listar',
                                     Authorization: `Basic ${ixckeybase64}`
                                   },
                                   data: {
                                     qtype: 'radusuarios.id_cliente',
                                     query: id,
                                     oper: '=',
                                     page: '1',
                                     rp: '1',
                                     sortname: 'radusuarios.id',
                                     sortorder: 'asc'
                                   }
                                 };
                                 
                                 axios.request(optionsRadius).then(async function (response) {
                                   let tipo;
                                   tipo = response.data?.type; 
                                   if(tipo === 'success') {
                                     await sleep(2000)
                                     await sendMessage(wbot, contact, ticket, mensagem);   
                                     const bodyPdf =  `Fiz os procedimentos de liberação! Agora aguarde até 5 minutos e veja se sua conexão irá retornar! .\n\nCaso não tenha voltado, retorne o contato e fale com um atendente!`
                                     await sleep(2000)
                                     await sendMessage(wbot, contact, ticket, bodyPdf);
                                     const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                                     await sleep(2000)
                                     await sendMessage(wbot, contact, ticket, bodyfinaliza);
                                       const ticketUpdateAgent = {
                                         ticketData: {
                                           status: "closed"
                                         },
                                         ticketId: ticket.id
                                       };
                                       await sleep(2000) 
                                       await UpdateTicketService(ticketUpdateAgent);  
                                   } else {
                                     await sleep(2000)
                                     await sendMessage(wbot, contact, ticket, mensagem);   
                                     const bodyPdf =  `Vou precisar que você *retire* seu equipamento da tomada.\n\n*OBS: Somente retire da tomada.* \nAguarde 1 minuto e ligue novamente!`
                                     await sleep(2000)
                                     await sendMessage(wbot, contact, ticket, bodyPdf);
                                     const bodyqrcode = `Veja se seu acesso voltou! Caso não tenha voltado retorne o contato e fale com um atendente!`
                                     await sleep(2000)
                                     await sendMessage(wbot, contact, ticket, bodyqrcode);  
                                     const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                                     await sleep(2000)
                                     await sendMessage(wbot, contact, ticket, bodyfinaliza);
                                       const ticketUpdateAgent = {
                                         ticketData: {
                                           status: "closed"
                                         },
                                         ticketId: ticket.id
                                       };
                                       await sleep(2000) 
                                       await UpdateTicketService(ticketUpdateAgent);  
                                   }
                                 }).catch(function (error) {
                                   console.error(error);
                                 });
                                 //FIM DA DESCONEXÃO 
                               
                                } else {
                                  const bodyerro = `Ops! Ocorreu um erro e nao consegui desbloquear!`
                                  await sleep(2000)
                                  await sendMessage(wbot, contact, ticket, bodyerro);  
                                  await sleep(2000)
                                  await sendMessage(wbot, contact, ticket, mensagem);  
                                  const bodyerroatendente = `Digite *#* e fale com um atendente!`
                                  await sleep(2000)
                                  await sendMessage(wbot, contact, ticket, bodyerroatendente);  
                                } /* else {
                                 const bodyerro = `Ops! Ocorreu um erro e nao consegui desbloquear! Digite *#* e fale com um atendente!`
                                 await sleep(2000)
                                 await sendMessage(wbot, contact, ticket, bodyerro);  
                             } */
                           
                           }).catch(async function (error) {
                             console.log('LINHA 738: ' + error)
                             const bodyerro = `Ops! Ocorreu um erro digite *#* e fale com um atendente!`
                             await sleep(2000)
                             await sendMessage(wbot, contact, ticket, bodyerro);  
                           });
                           } else {
                            const bodysembloqueio = `Sua Conexão não está bloqueada! Caso esteja com dificuldades de navegação, retorne o contato e fale com um atendente!`
                            await sleep(2000)
                            await sendMessage(wbot, contact, ticket, bodysembloqueio);                            
                           const bodyfinaliza = `Estamos finalizando esta conversa! Caso precise entre em contato conosco!`
                           await sleep(2000)
                           await sendMessage(wbot, contact, ticket, bodyfinaliza);
                             const ticketUpdateAgent = {
                               ticketData: {
                                 status: "closed"
                               },
                               ticketId: ticket.id
                             };
                             await sleep(2000) 
                             await UpdateTicketService(ticketUpdateAgent); 
                           }
                           
                           //
                           }).catch(async function (error) {
                           console.log('LINHA 746: ' + error)
                           const bodyerro = `Ops! Ocorreu um erro digite *#* e fale com um atendente!`
                           await sleep(2000)
                           await sendMessage(wbot, contact, ticket, bodyerro);  
                           });                              
    
              }
    
            }).catch(async function (error) {
              const body = `*Opss!!!!*\nOcorreu um erro! Digite *#* e fale com um *Atendente*!`;
              await sleep(2000)
              await sendMessage(wbot, contact, ticket, body); 
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

  if (selectedOption === "#") {
    const backTo = await backToMainMenu(wbot, contact, ticket);
    return backTo;
  }

  if (!getStageBot) {
    const queue = await ShowQueueService(queueId);

    const selectedOption =
    msg?.message?.buttonsResponseMessage?.selectedButtonId ||
    msg?.message?.listResponseMessage?.singleSelectReply.selectedRowId ||
      getBodyMessage(msg);

     //console.log("!getStageBot", selectedOption);
    const choosenQueue = queue.chatbots[+selectedOption - 1];

    if (!choosenQueue?.greetingMessage) {
      await DeleteDialogChatBotsServices(contact.id);
      return;
    } // nao tem mensagem de boas vindas
    if (choosenQueue) {
      if (choosenQueue.isAgent) {
        try {
          const getUserByName = await User.findOne({
            where: {
              name: choosenQueue.name
            }
          });
          const ticketUpdateAgent = {
            ticketData: {
              userId: getUserByName.id,
              status: "open"
            },
            ticketId: ticket.id
          };
          await UpdateTicketService(ticketUpdateAgent);
        } catch (error) {
          await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
        }
      }
      await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
      const send = await sendDialog(choosenQueue, wbot, contact, ticket);
      return send;
    }
  }

  if (getStageBot) {
    const selected = isNumeric(selectedOption) ? selectedOption : 1;
    const bots = await ShowChatBotServices(getStageBot.chatbotId);
    //console.log("getStageBot", selected);

    const choosenQueue = bots.options[+selected - 1]
      ? bots.options[+selected - 1]
      : bots.options[0];

      //console.log("choosenQueue", choosenQueue);

    if (!choosenQueue.greetingMessage) {
      await DeleteDialogChatBotsServices(contact.id);
      return;
    } // nao tem mensagem de boas vindas
    if (choosenQueue) {
      if (choosenQueue.isAgent) {
        const getUserByName = await User.findOne({
          where: {
            name: choosenQueue.name
          }
        });
        const ticketUpdateAgent = {
          ticketData: {
            userId: getUserByName.id,
            status: "open"
          },
          ticketId: ticket.id
        };
        await UpdateTicketService(ticketUpdateAgent);
      }
      await deleteAndCreateDialogStage(contact, choosenQueue.id, ticket);
      const send = await sendDialog(choosenQueue, wbot, contact, ticket);
      return send;
    }
  }
};
