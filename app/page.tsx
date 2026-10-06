import Image from 'next/image';
import Link from 'next/link';

export default function Home() {
  return <>
    <header className="header"><div className="container nav">
      <Link href="/"><Image src="/brand/bootroom-logo.png" alt="BOOTROOM" width={116} height={100} priority /></Link>
      <nav className="navlinks"><Link href="/turfs">Turfs</Link><Link href="/matches">Matches</Link><Link href="/owner">List your turf</Link></nav>
      <div className="navcta"><Link className="btn ghost" href="/login">Sign in</Link><Link className="btn primary" href="/turfs">Book a pitch</Link></div>
    </div></header>
    <main>
      <section className="hero"><div className="container heroContent">
        <Image className="heroLogo" src="/brand/bootroom-logo.png" alt="BOOTROOM" width={290} height={249} priority />
        <div className="label">KOLKATA · FOOTBALL TURF BOOKING</div>
        <h1 className="display">THE PITCH<br/><span className="gold">IS WAITING.</span></h1>
        <p className="heroSub">Find a pitch. Find your game. Enter the game. BOOTROOM brings Kolkata football together.</p>
        <form className="searchbar" action="/turfs">
          <label className="wide"><span className="label">Where</span><input name="q" placeholder="Kolkata or locality" /></label>
          <label><span className="label">Date</span><input type="date" name="date" /></label>
          <label><span className="label">Time</span><input type="time" name="time" /></label>
          <label><span className="label">Format</span><select name="format" defaultValue="7v7"><option>5v5</option><option>6v6</option><option>7v7</option><option>8v8</option><option>11v11</option></select></label>
          <button className="btn primary" type="submit">FIND TURF</button>
        </form>
      </div></section>

      <section className="section"><div className="container">
        <div className="sectionHead"><div><div className="label">Start here</div><h2 className="display">FIND YOUR GAME.</h2></div><Link className="btn" href="/turfs">View all turfs</Link></div>
        <div className="cards"><EmptyTurf /><EmptyTurf /><EmptyTurf /></div>
      </div></section>

      <section className="section"><div className="container">
        <div className="sectionHead"><div><div className="label">The system</div><h2 className="display">FROM SEARCH TO KICK-OFF.</h2></div></div>
        <div className="steps"><div className="step"><div className="stepNum">01</div><h3>FIND</h3><p className="muted">Search verified pitches by locality, format, price and availability.</p></div><div className="step"><div className="stepNum">02</div><h3>CLAIM</h3><p className="muted">Choose a live slot and secure it through the booking hold.</p></div><div className="step"><div className="stepNum">03</div><h3>PLAY</h3><p className="muted">Get your confirmation. Turn up. Play football.</p></div></div>
      </div></section>

      <section className="section"><div className="container"><div className="owner"><div><div className="label">For turf owners</div><h2 className="display">OWN THE PITCH?</h2><p className="muted">Bring your venue onto Kolkata's football network.</p></div><Link className="btn primary" href="/owner">LIST YOUR TURF</Link></div></div></section>
    </main>
    <footer className="footer"><div className="container footerGrid"><Image src="/brand/bootroom-logo.png" alt="BOOTROOM" width={110} height={94}/><div>BOOTROOM · Kolkata, India</div><div>Booking platform · Football community</div></div></footer>
  </>
}
function EmptyTurf(){return <div className="card"><div className="cardImage"/><div className="cardBody"><div className="label">Inventory awaiting onboarding</div><div className="cardTitle">No venue listed yet</div><p className="muted">This launch build deliberately contains no fictional Kolkata venue data.</p><Link className="btn" href="/owner">Add a verified venue</Link></div></div>}
