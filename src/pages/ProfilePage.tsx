import { useState } from 'react';
import { Briefcase, FolderGit2, Sparkles, User } from 'lucide-react';
import { useProfile } from '@/hooks/queries';
import { PageHeader } from '@/components/ui/Primitives';
import { ErrorState, ListSkeleton } from '@/components/ui/States';
import { Tabs } from '@/components/ui/Tabs';
import { ProfileForm } from '@/components/profile/ProfileForm';
import { ExperienceSection, ProjectSection, SkillSection } from '@/components/profile/CollectionSections';

type Tab = 'dados' | 'experiencias' | 'projetos' | 'skills';

export function ProfilePage() {
  const [tab, setTab] = useState<Tab>('dados');
  const { data, isPending, error, refetch } = useProfile();

  return (
    <>
      <PageHeader
        title="Perfil profissional"
        description="A fonte de verdade do JobPilot. Currículos e textos gerados partem daqui."
      />

      {error ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending || !data ? (
        <ListSkeleton rows={4} />
      ) : (
        <>
          <Tabs<Tab>
            value={tab}
            onChange={setTab}
            className="mb-5"
            items={[
              { value: 'dados', label: 'Dados', icon: <User /> },
              { value: 'experiencias', label: 'Experiências', count: data.experiences.length, icon: <Briefcase /> },
              { value: 'projetos', label: 'Projetos', count: data.projects.length, icon: <FolderGit2 /> },
              { value: 'skills', label: 'Skills', count: data.skills.length, icon: <Sparkles /> },
            ]}
          />

          {tab === 'dados' && <ProfileForm profile={data.profile} />}
          {tab === 'experiencias' && <ExperienceSection experiences={data.experiences} />}
          {tab === 'projetos' && <ProjectSection projects={data.projects} />}
          {tab === 'skills' && <SkillSection skills={data.skills} />}
        </>
      )}
    </>
  );
}
