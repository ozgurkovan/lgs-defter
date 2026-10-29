// Aile yönetimi: veliler uygulamanın içinden çocuk ekler, siler ve ikinci bir veli ekler.
// Hesap açma/silme yetkisi sadece burada (sunucuda) vardır; her istekte isteyenin veli olduğu
// ve işlem yaptığı çocuğun kendi çocuğu olduğu kontrol edilir.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';

const ALLOWED_ORIGINS = ['https://ozgurkovan.github.io', 'http://localhost:5500'];

function cors(req: Request) {
  const origin = req.headers.get('Origin') ?? '';
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  };
}

Deno.serve(async (req) => {
  const headers = { ...cors(req), 'Content-Type': 'application/json' };
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers });
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return reply(405, { error: 'Sadece POST' });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  });

  // İsteyen kim? Veli mi?
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data: who, error: whoErr } = await admin.auth.getUser(jwt);
  if (whoErr || !who?.user) return reply(401, { error: 'Giriş yapmalısın.' });
  const me = who.user.id;
  const { data: myProfile } = await admin.from('profiles').select('role').eq('id', me).maybeSingle();
  if (myProfile?.role !== 'parent') return reply(403, { error: 'Bu işlemi sadece veli yapabilir.' });

  // Ailem: velisi olduğum çocuklar, o çocukların bütün velileri ve öğretmenleri.
  const { data: myLinks } = await admin.from('family_links').select('student_id').eq('parent_id', me).eq('relation', 'parent');
  const myChildren = (myLinks ?? []).map((l) => l.student_id as string);
  const { data: coLinks } = myChildren.length
    ? await admin.from('family_links').select('parent_id, student_id, relation, subjects').in('student_id', myChildren)
    : { data: [] as { parent_id: string; student_id: string; relation: string; subjects: string[] | null }[] };
  const familyParents = [...new Set([me, ...(coLinks ?? []).filter((l) => l.relation === 'parent').map((l) => l.parent_id as string)])];
  const familyTeachers = [...new Set((coLinks ?? []).filter((l) => l.relation === 'teacher').map((l) => l.parent_id as string))];
  const onlyMyChildren = (ids: unknown) => (Array.isArray(ids) ? ids : []).map(String).filter((id) => myChildren.includes(id));
  // Öğretmenin görebileceği dersler: hepsi seçiliyse null (bütün dersler).
  const ALL_SUBJECTS = ['turkce', 'matematik', 'fen', 'inkilap', 'din', 'ingilizce', 'hayat', 'sosyal'];
  const subjectsFrom = (v: unknown) => {
    const list = [...new Set((Array.isArray(v) ? v : []).map(String).filter((s) => ALL_SUBJECTS.includes(s)))];
    if (!list.length) throw new Error('Öğretmenin görebileceği en az bir ders seçin.');
    return list.length === ALL_SUBJECTS.length ? null : list;
  };

  async function findUserByEmail(mail: string) {
    for (let page = 1; page <= 20; page++) {
      const { data } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      const hit = data?.users.find((u) => u.email?.toLowerCase() === mail);
      if (hit) return hit;
      if (!data || data.users.length < 200) return null;
    }
    return null;
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return reply(400, { error: 'Geçersiz istek.' }); }
  const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const email = text(body.email).toLowerCase();
  const name = text(body.name);
  const password = typeof body.password === 'string' ? body.password : '';

  async function createAccount() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-posta adresi geçersiz.');
    if (password.length < 6) throw new Error('Şifre en az 6 karakter olmalı.');
    if (!name) throw new Error('Ad boş olamaz.');
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) {
      throw new Error(/already|registered|exists/i.test(error.message)
        ? 'Bu e-posta ile zaten bir hesap var.' : 'Hesap açılamadı: ' + error.message);
    }
    return data.user!.id;
  }

  try {
    switch (body.action) {
      case 'add_child': {
        const grade = Number(body.grade);
        if (!Number.isInteger(grade) || grade < 1 || grade > 8) throw new Error('Sınıf 1 ile 8 arasında olmalı.');
        const id = await createAccount();
        // İlkokulda günlük hedef daha hafif başlar; veli Günlük plan'dan değiştirir.
        const { error: pErr } = await admin.from('profiles').insert({ id, role: 'student', display_name: name, grade, daily_questions: grade <= 4 ? 20 : 40 });
        if (pErr) { await admin.auth.admin.deleteUser(id); throw new Error('Profil oluşturulamadı.'); }
        await admin.from('family_links').insert(familyParents.map((parent_id) => ({ parent_id, student_id: id, relation: 'parent' })));
        // Yıllık plana göre haftası gelmiş konular hemen takibe girsin.
        await admin.rpc('activate_planned_topics');
        return reply(200, { ok: true, id });
      }
      case 'add_parent': {
        if (!myChildren.length) throw new Error('Önce bir çocuk ekleyin.');
        const id = await createAccount();
        const { error: pErr } = await admin.from('profiles').insert({ id, role: 'parent', display_name: name });
        if (pErr) { await admin.auth.admin.deleteUser(id); throw new Error('Profil oluşturulamadı.'); }
        await admin.from('family_links').insert(myChildren.map((student_id) => ({ parent_id: id, student_id, relation: 'parent' })));
        return reply(200, { ok: true, id });
      }
      case 'add_teacher': {
        // Öğretmen sadece seçilen çocukları görür. Hesabı varsa (başka ailenin de öğretmeniyse) ona bağlanır.
        const students = onlyMyChildren(body.student_ids);
        if (!students.length) throw new Error('Öğretmenin göreceği en az bir çocuk seçin.');
        const subjects = subjectsFrom(body.subjects);
        const existing = email ? await findUserByEmail(email) : null;
        let id: string;
        if (existing) {
          const { data: p } = await admin.from('profiles').select('role').eq('id', existing.id).maybeSingle();
          if (p && p.role !== 'teacher') throw new Error('Bu e-posta öğretmen olmayan bir hesaba ait.');
          id = existing.id;
          if (!p) await admin.from('profiles').insert({ id, role: 'teacher', display_name: name || email });
        } else {
          id = await createAccount();
          const { error: pErr } = await admin.from('profiles').insert({ id, role: 'teacher', display_name: name });
          if (pErr) { await admin.auth.admin.deleteUser(id); throw new Error('Profil oluşturulamadı.'); }
        }
        await admin.from('family_links').upsert(students.map((student_id) => ({ parent_id: id, student_id, relation: 'teacher', subjects })));
        return reply(200, { ok: true, id, existing: !!existing });
      }
      case 'set_teacher_students': {
        // Öğretmenin gördüğü çocukları değiştirir (sadece kendi çocuklarım arasında). Boş liste = erişimi kaldır.
        const teacherId = text(body.teacher_id);
        if (!familyTeachers.includes(teacherId)) return reply(403, { error: 'Bu öğretmen sizin ailenizde değil.' });
        const keep = onlyMyChildren(body.student_ids);
        const drop = myChildren.filter((c) => !keep.includes(c));
        const subjects = keep.length ? subjectsFrom(body.subjects) : null;
        if (drop.length) await admin.from('family_links').delete().eq('parent_id', teacherId).eq('relation', 'teacher').in('student_id', drop);
        if (keep.length) await admin.from('family_links').upsert(keep.map((student_id) => ({ parent_id: teacherId, student_id, relation: 'teacher', subjects })));
        return reply(200, { ok: true });
      }
      case 'delete_child': {
        const id = text(body.student_id);
        if (!myChildren.includes(id)) return reply(403, { error: 'Bu çocuk sizin ailenizde değil.' });
        // Fotoğrafları sil (depodaki <öğrenci>/ klasörü), sonra hesabı: kayıtlar kendiliğinden silinir.
        const { data: subs } = await admin.from('submissions').select('id').eq('student_id', id);
        for (const s of subs ?? []) {
          const folder = `${id}/${s.id}`;
          const { data: files } = await admin.storage.from('photos').list(folder, { limit: 1000 });
          if (files?.length) await admin.storage.from('photos').remove(files.map((f) => `${folder}/${f.name}`));
        }
        const { error } = await admin.auth.admin.deleteUser(id);
        if (error) throw new Error('Silinemedi: ' + error.message);
        return reply(200, { ok: true });
      }
      case 'list': {
        // Ailedeki çocuklar, veliler ve öğretmenler; giriş e-postaları ve öğretmenin gördüğü çocuklar.
        const ids = [...new Set([...myChildren, ...familyParents, ...familyTeachers])];
        const out: Record<string, string> = {};
        for (const id of ids) {
          const { data } = await admin.auth.admin.getUserById(id);
          if (data?.user?.email) out[id] = data.user.email;
        }
        const { data: profiles } = await admin.from('profiles').select('id, role, display_name, grade').in('id', ids);
        const teacherLinks = (id: string) => (coLinks ?? []).filter((l) => l.parent_id === id && l.relation === 'teacher');
        return reply(200, {
          ok: true, me,
          members: (profiles ?? []).map((p) => ({
            ...p, email: out[p.id] ?? '',
            student_ids: p.role === 'teacher' ? teacherLinks(p.id).map((l) => l.student_id) : undefined,
            subjects: p.role === 'teacher' ? (teacherLinks(p.id)[0]?.subjects ?? null) : undefined,
          })),
        });
      }
      default:
        return reply(400, { error: 'Bilinmeyen işlem.' });
    }
  } catch (e) {
    return reply(400, { error: (e as Error).message });
  }
});
