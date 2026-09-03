'use client';

import * as React from 'react';

/**
 * หน่วงค่าไว้จนกว่าผู้ใช้จะหยุดพิมพ์
 *
 * ตอนกรองในหน่วยความจำ ทุกตัวอักษรที่พิมพ์แทบไม่มีต้นทุน
 * แต่พอเปลี่ยนไปกรองที่ฐานข้อมูล ตัวอักษรเดียวเท่ากับหนึ่งคำขอ
 * คำค้นภาษาลาวสั้น ๆ คำเดียวก็กลายเป็นสิบกว่าคิวรีที่ถูกทิ้งเกือบหมด
 *
 * 350ms เป็นค่าที่ยาวพอจะรวบการพิมพ์ต่อเนื่องเข้าด้วยกัน
 * แต่สั้นพอที่ผู้ใช้ยังรู้สึกว่าผลลัพธ์ตอบสนองทันที
 */
export function useDebounced<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = React.useState(value);

  React.useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    // ล้าง timer เดิมทุกครั้งที่ค่าเปลี่ยน มิฉะนั้นค่าเก่าจะถูกตั้งทับค่าใหม่
    // ตอนที่ผู้ใช้พิมพ์เร็วกว่าเวลาหน่วง
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
