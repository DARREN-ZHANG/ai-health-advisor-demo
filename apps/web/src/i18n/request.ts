import { getRequestConfig } from 'next-intl/server';

export default getRequestConfig(async () => {
  // 默认英文，客户端切换后通过 NextIntlClientProvider 覆盖
  const locale = 'en';
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
