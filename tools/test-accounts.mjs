// Test hesapları. Şifresiz giriş bağlantısı (sb.mjs login-link, test-family.mjs) yalnızca bunlara üretilir:
// Supabase, hesabı olmayan bir adrese giriş bağlantısı istenince o adrese yeni hesap açar. Bu yüzden adres
// elle yazılmaz, hesabın kimliğinden okunur.
export const TEST_ACCOUNTS = {
  irftest: 'dbdb25a7-5944-49b6-94b0-fcd855a205ed', // öğrenci, 8. sınıf
  test4: 'c16864e7-684c-42fb-bb5e-f99c05b2a219', // öğrenci, 4. sınıf (ilkokul görünümü)
  testveli: 'eac9fc92-6e78-4e48-a81b-409aff6678c9', // veli, IrfTest ve test4.sinif'e bağlı
  // öğretmen; Isla'ya da (gerçek çocuk, Türkçe) bağlı, test için test4.sinif'e bağlanacak. Ekran testi seçili çocuk test
  // çocuğu değilse hiçbir sayfa açmadan durur (ui-smoke.js). Yeni test hesabı eklenirse ui-smoke.js'teki listeye de eklenir.
  testogretmen: '0502e009-7d69-40a9-b7c6-ceedaad1012f',
  abdveli: '39be86d3-9683-41f6-8e2a-a6621594803f', // veli (ABD denemesi), ABD4 ve ABD7'ye bağlı
  abd4: '543d12a4-a7c8-464a-92ce-1bd23d37eec5', // öğrenci, 4. sınıf, müfredat us-pa (Pennsylvania)
  abd7: '6d0357bd-35f9-4a55-b8ab-ceb6dcd4e6d1', // öğrenci, 7. sınıf, müfredat us-pa (Pennsylvania)
  abd2: '04015894-64ef-4d4a-b868-c18090967b82', // öğrenci, 2. sınıf, müfredat us-pa (Pennsylvania)
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
