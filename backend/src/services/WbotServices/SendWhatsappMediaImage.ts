import { WAMessage } from "@adiwajshing/baileys";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import formatBody from "../../helpers/Mustache";
// import mime from "mime-types";
import fs from "fs";

interface Request {
    body: string;
    ticket: Ticket;
    quotedMsg?: Message;
}

function makeid(length) {
    var result = '';
    var characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for (var i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
    }
    return result;
}

const SendWhatsAppMediaImage = async ({
    ticket,
    url,
    caption
}): Promise<WAMessage> => {
    const wbot = await GetTicketWbot(ticket);
    const number = `${ticket.contact.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"
        }`;

    try {
        const sentMessage = await wbot.sendMessage(
            `${number}`,
            {
                image: url ? { url } : fs.readFileSync(`public/temp/${caption}-${makeid(10)}.png`),
                caption: caption,
                mimetype: 'image/jpeg'
            }
        );
        return sentMessage;
    } catch (err) {
        throw new AppError("ERR_SENDING_WAPP_MSG");
    }

};

export default SendWhatsAppMediaImage;