import type {
  SupportChatMessageRow,
  SupportChatRow,
} from '../../db/repositories/support-chat.repository';
import { visitorName } from './chatwoot-widget';
import type { SupportChatMessageDto } from './support-chat.dto';

/**
 * แปลงข้อความเป็นรูปที่ส่งให้หน้าจอ — ใช้ทั้ง service และตัวซิงก์ Chatwoot
 *
 * แยกไฟล์ไว้ไม่ให้สองฝั่ง import กันเองเป็นวง (service ↔ sync) ซึ่งทำให้ Nest ฉีด dependency ไม่ได้
 *
 * ข้อความที่มาจาก Chatwoot ไม่มีบัญชีใน Helpdesk: sender.id = 0 และชื่อเป็นชื่อเจ้าหน้าที่ฝั่งนั้น
 * id 0 ไม่มีวันตรงกับผู้ใช้จริง หน้าจอจึงไม่แสดงเป็นข้อความของตัวเองโดยไม่ตั้งใจ
 *
 * ⚠️ ข้อความของผู้เข้าชมเว็บ (from_contact) กับคำตอบของเจ้าหน้าที่ฝั่ง Chatwoot
 *    หน้าตาเหมือนกันในฐานข้อมูล — ทั้งคู่ sender_id เป็น null และมี external_sender_name
 *    ตัวที่แยกคือธง from_contact ถ้าอ่านผิด ข้อความของผู้เข้าชมจะขึ้นเป็นคำตอบของทีมไอที
 *    แล้วทั้งห้องจะกลับด้านกันหมดในหน้าจอ
 */
export function toMessageDto(row: SupportChatRow, message: SupportChatMessageRow): SupportChatMessageDto {
  const external = message.externalSenderName !== null;
  const fromContact = message.fromContact;

  return {
    id: message.id,
    chat_id: message.chatId,
    body: message.body,
    is_system: message.isSystem,
    from_staff:
      !message.isSystem && !fromContact && (external || message.senderId !== row.requesterId),
    sender: fromContact
      ? { id: 0, full_name: message.externalSenderName ?? visitorName(row.contactName) }
      : external
        ? { id: 0, full_name: message.externalSenderName ?? 'Chatwoot' }
        : message.senderId !== null
          ? { id: message.senderId, full_name: message.senderName ?? '' }
          : null,
    attachment: message.attachment
      ? {
          kind: message.attachment.kind,
          name: message.attachment.name,
          mime_type: message.attachment.mime,
          size: message.attachment.size,
          path: `/support-chat/${message.chatId}/messages/${message.id}/file`,
        }
      : null,
    created_at: message.createdAt.toISOString(),
  };
}
