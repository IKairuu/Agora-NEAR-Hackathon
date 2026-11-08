import { Hero } from './components/Hero';
import { HowItWorks } from './components/HowItWorks';
import { Nav } from './components/Nav';
import { Faq, FinalCta, Footer, Safety, Sides, Stack } from './components/Sections';
import { useLook } from './lib/look';

export default function App() {
  const look = useLook();
  return (
    <div className="land">
      <Nav look={look} />
      <main>
        <Hero accent={look.look.accent} />
        <HowItWorks />
        <Sides />
        <Safety />
        <Stack />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}
