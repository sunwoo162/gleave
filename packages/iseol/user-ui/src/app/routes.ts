import { lazy } from 'react';
import { createBrowserRouter } from 'react-router';

const Landing = lazy(() => import('../pages/Landing'));
const NotFound = lazy(() => import('../pages/NotFound'));
const LoginPage = lazy(() => import('../pages/Auth').then(({ LoginPage }) => ({ default: LoginPage })));
const SignupPage = lazy(() => import('../pages/Auth').then(({ SignupPage }) => ({ default: SignupPage })));
const Onboarding = lazy(() => import('../pages/Onboarding'));
const MyWorld = lazy(() => import('../pages/MyWorld'));
const CharacterDetail = lazy(() => import('../pages/Character').then(({ CharacterDetail }) => ({ default: CharacterDetail })));
const CharacterCustomize = lazy(() => import('../pages/Character').then(({ CharacterCustomize }) => ({ default: CharacterCustomize })));
const IdeaLab = lazy(() => import('../pages/IdeaLab'));
const ProjectList = lazy(() => import('../pages/Projects').then(({ ProjectList }) => ({ default: ProjectList })));
const ProjectWorkspace = lazy(() => import('../pages/Projects').then(({ ProjectWorkspace }) => ({ default: ProjectWorkspace })));
const AIChat = lazy(() => import('../pages/AIChat'));
const MemoryVault = lazy(() => import('../pages/MemoryVault'));
const Learning = lazy(() => import('../pages/Learning'));
const TeamRecruit = lazy(() => import('../pages/Teams').then(({ TeamRecruit }) => ({ default: TeamRecruit })));
const Community = lazy(() => import('../pages/Community'));
const Friends = lazy(() => import('../pages/Friends'));
const ActivityTimeline = lazy(() => import('../pages/PortfolioApi').then(({ ActivityTimeline }) => ({ default: ActivityTimeline })));
const PortfolioPage = lazy(() => import('../pages/PortfolioApi').then(({ PortfolioPage }) => ({ default: PortfolioPage })));
const Settings = lazy(() => import('../pages/Settings'));
const PublicPortfolio = lazy(() => import('../pages/PublicPortfolio'));
const Profile = lazy(() => import('../pages/Profile'));
const TermsPage = lazy(() => import('../pages/Information').then(({ TermsPage }) => ({ default: TermsPage })));
const PrivacyPage = lazy(() => import('../pages/Information').then(({ PrivacyPage }) => ({ default: PrivacyPage })));
const HelpPage = lazy(() => import('../pages/Information').then(({ HelpPage }) => ({ default: HelpPage })));

export const router = createBrowserRouter([
  { path: '/', Component: Landing },
  { path: '/terms', Component: TermsPage },
  { path: '/privacy', Component: PrivacyPage },
  { path: '/help', Component: HelpPage },
  { path: '/login', Component: LoginPage },
  { path: '/signup', Component: SignupPage },
  { path: '/onboarding', Component: Onboarding },
  { path: '/world', Component: MyWorld },
  { path: '/character', Component: CharacterDetail },
  { path: '/character/customize', Component: CharacterCustomize },
  { path: '/idea-lab', Component: IdeaLab },
  { path: '/projects', Component: ProjectList },
  { path: '/projects/:id', Component: ProjectWorkspace },
  { path: '/ai-chat', Component: AIChat },
  { path: '/memory', Component: MemoryVault },
  { path: '/learning', Component: Learning },
  { path: '/learning/session', Component: Learning },
  { path: '/teams', Component: TeamRecruit },
  { path: '/community', Component: Community },
  { path: '/friends', Component: Friends },
  { path: '/profile', Component: Profile },
  { path: '/activity', Component: ActivityTimeline },
  { path: '/portfolio', Component: PortfolioPage, handle: { productSurface: 'api-backed-portfolio-v1' } },
  { path: '/portfolio/public/:entryId', Component: PublicPortfolio },
  { path: '/settings', Component: Settings },
  { path: '/integrations', Component: Settings },
  { path: '*', Component: NotFound },
], { basename: '/app' });
