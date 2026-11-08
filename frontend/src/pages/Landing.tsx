import { Hero } from '../components/Hero';
import { HowItWorks } from '../components/HowItWorks';
import { Nav } from '../components/Nav';
import { Faq, FinalCta, Footer, Safety, Sides, Stack } from '../components/Sections';

export function Landing() {
  return (
    <div className="land">
      <Nav />
      <main>
        <Hero />
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
