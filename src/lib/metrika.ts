// Цели Яндекс.Метрики. Сам счётчик подключается в src/instrumentation-client.ts.
// Идентификаторы целей нужно завести в кабинете Метрики: тип «JavaScript-событие».
export const YM_ID = 114003002;

export type Goal =
  | "lead_form_open" // открыта модалка заявки
  | "lead_submit" // заявка успешно отправлена (любая форма)
  | "lead_error" // отправка заявки не удалась
  | "catalog_search" // поиск авто в первом экране
  | "phone_click"
  | "email_click"
  | "messenger_click" // Telegram, MAX, VK
  | "catalog_click"; // переход в каталог catalog.rangauto.ru

export function reachGoal(goal: Goal, params?: Record<string, unknown>, callback?: () => void) {
  try {
    if (window.ym) {
      window.ym(YM_ID, "reachGoal", goal, params, callback);
      return;
    }
  } catch {}
  callback?.();
}
