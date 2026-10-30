// Test hesapları. Şifresiz giriş bağlantısı (sb.mjs login-link, test-family.mjs) yalnızca bunlara üretilir:
// Supabase, hesabı olmayan bir adrese giriş bağlantısı istenince o adrese yeni hesap açar. Bu yüzden adres
// elle yazılmaz, hesabın kimliğinden okunur.
export const TEST_ACCOUNTS = {
  irftest: 'dbdb25a7-5944-49b6-94b0-fcd855a205ed', // öğrenci
  testveli: 'eac9fc92-6e78-4e48-a81b-409aff6678c9', // veli, yalnızca IrfTest'e bağlı
  testogretmen: '0502e009-7d69-40a9-b7c6-ceedaad1012f', // öğretmen, IrfTest'te matematik ve fen
};

// Test hesabının giriş e-postası. Listede olmayan bir ad Supabase'e hiç sorulmadan reddedilir.
export async function testAccountEmail(name, base, headers) {
  const key = String(name ?? '').toLowerCase();
  if (!Object.hasOwn(TEST_ACCOUNTS, key)) {
    throw new Error(`Giriş bağlantısı yalnızca test hesapları için üretilir: ${Object.keys(TEST_ACCOUNTS).join(', ')}`);
  }
  const res = await fetch(`${base}/auth/v1/admin/users/${TEST_ACCOUNTS[key]}`, { headers });
  if (!res.ok) throw new Error(`${key} hesabı bulunamadı: ${res.status} ${await res.text()}`);
  return (await res.json()).email;
}
