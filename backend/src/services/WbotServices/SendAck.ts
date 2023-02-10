import { WASocket } from "@adiwajshing/baileys";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import ShowTicketService from "../TicketServices/ShowTicketService";

export const SendAckBYticketId = async ({ ticketId
}): Promise<Response> => {
    const ticket = await ShowTicketService(ticketId);

    if (!ticket) {
        throw new AppError("ERR_NO_TICKET_FOUND", 404);
    }

    const limit = 100;

    const { count, rows: messages } = await Message.findAndCountAll({
        limit,
        include: [
            "contact",
            {
                model: Message,
                as: "quotedMsg",
                include: ["contact"]
            },
            {
                model: Ticket,
                where: { contactId: ticket.contactId },
                required: true
            }
        ],
        order: [["createdAt", "DESC"]]
    }
    );
    messages.forEach(async (message) => {
        const wbot = await GetTicketWbot(message.ticket);
        const count = wbot.store.chats.get(message.remoteJid);

        let remoteJid = message.remoteJid;
        let messageId = message.id;
        let ticket = message.ticket;
        ticket.update({ unreadMessages: 0 });
        if (remoteJid && count?.unreadCount > 0) {
            wbot.store.chats.deleteById(remoteJid)
            wbot.sendPresenceUpdate('available');
            wbot.sendPresenceUpdate('unavailable');
        }
        try {
            //const sentMessage = await (wbot as WASocket)!.sendReadReceipt(
            //    remoteJid,
            //    null,
            //    [messageId],
            //);

const key = {
    remoteJid: remoteJid,
    id: messageId
}
	    const sentMessage = await (wbot as WASocket)!.readMessages([key])

            return sentMessage;
        } catch (err) {
            throw new AppError("ERR_SENDING_WAPP_MSG");
        }
    });

    return
}

export const SendAckBYRemoteJid = async ({ remoteJid
}): Promise<Response> => {

    const { rows: messages } = await Message.findAndCountAll({
        limit: 1,
        order: [["createdAt", "DESC"]],
        where: {
            remoteJid: remoteJid, ack: 0,



        }
    }
    );
    messages.forEach(async (message) => {
        let ticketId = message.ticketId
        SendAckBYticketId({ ticketId })

    });

    return
}  