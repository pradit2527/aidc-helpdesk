import type {
  SupportChatMessageRow,
  SupportChatRow,
} from '../../db/repositories/support-chat.repository';
import type { SupportChatMessageDto } from './support-chat.dto';

/**
 * แปลงข้อความเป็นรูปที่ส่งให้หน้าจอ — ใช้ทั้ง service และตัวซิงก์ Chatwoot
 *
 * แยกไฟล์ไว้ไม่ให้สองฝั่ง import กันเองเป็นวง (service ↔ sync) ซึ่งทำให้ Nest ฉีด dependency ไม่ได้
 *
 * ข้อความที่มาจาก Chatwoot ไม่มีบัญชีใน Helpdesk: sender.id = 0 และชื่อเป็นชื่อเจ้าหน้าที่ฝั่งนั้น
 * id 0 ไม่มีวันตรงกับผู้ใช้จริง หน้าจอจึงไม่แสดงเป็นข้อความของตัวเองโดยไม่ตั้งใจ
 */
export function toMessageDto(row: SupportChatRow, message: SupportChatMessageRow): SupportChatMessageDto {
  const external = message.externalSenderName !== null;
  return {
    id: message.id,
    chat_id: message.chatId,
    body: message.body,
    is_system: message.isSystem,
    from_staff: !message.isSystem && (external || message.senderId !== row.requesterId),
    sender: external
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
