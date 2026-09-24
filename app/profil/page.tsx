import { getCurrentProfile } from '@/lib/supabase/server';
import { Sidebar } from '@/components/sidebar';
import { NameForm, PasswordForm } from '@/components/profile-forms';

export default async function ProfilPage() {
  const profile = await getCurrentProfile();

  return (
    <main>
      <Sidebar active="/profil" profile={profile} />
      <section className="content">
        <header>
          <div>
            <p className="eyebrow">Mon compte</p>
            <h1>Mon profil</h1>
            <p>Gère ton nom et ton mot de passe.</p>
          </div>
        </header>

        <NameForm fullName={profile?.full_name || ''} />
        <PasswordForm />
      </section>
    </main>
  );
}
