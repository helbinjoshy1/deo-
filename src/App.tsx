import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent, type KeyboardEvent } from 'react';
import {
  ArrowRight, ArrowUpRight, Check, ChevronDown, Droplets, ExternalLink,
  FlaskConical, Heart, Info, Leaf, LoaderCircle, LockKeyhole, ScanLine, Search,
  ShieldCheck, Sparkles, Sun, TriangleAlert, Upload, X,
} from 'lucide-react';
import { analyzeIngredients, type SkinProfile, type SkinType } from './lib/analysis';

type Product = { id: string; name: string; brand: string; ingredients: string; sourceUrl: string; updatedAt?: string };
type Comparison = { name: string; ingredients: string; example: boolean; sourceUrl?: string; updatedAt?: string };
const EXAMPLE = {
  name: 'Daily Barrier Moisturizer',
  ingredients: 'Aqua, Glycerin, Caprylic/Capric Triglyceride, Cetyl Alcohol, Niacinamide, Ceramide NP, Panthenol, Sodium Hyaluronate, Parfum',
  example: true,
};
const INITIAL_PROFILE: SkinProfile = {
  skinType: 'unsure', sensitive: false, concerns: [], allergies: '', audience: 'everyone', pregnant: false, shaving: false,
};
const SKIN_TYPES: { id: SkinType; name: string; hint: string }[] = [
  { id: 'dry', name: 'Dry', hint: 'Often feels tight' },
  { id: 'oily', name: 'Oily', hint: 'Often looks shiny' },
  { id: 'combination', name: 'Combination', hint: 'A bit of both' },
  { id: 'balanced', name: 'Balanced', hint: 'Usually comfortable' },
  { id: 'unsure', name: 'Not sure', hint: 'That’s okay, too' },
];
const SOURCES: Record<string, { name: string; url: string }> = {
  'aad-test': { name: 'AAD · Testing skincare', url: 'https://www.aad.org/public/everyday-care/skin-care-secrets/prevent-skin-problems/test-skin-care-products' },
  'aad-sensitive': { name: 'AAD · Dry and sensitive skin', url: 'https://www.aad.org/public/everyday-care/skin-care-basics/dry/dermatologists-tips-relieve-dry-skin' },
  'fda-labels': { name: 'FDA · Cosmetics labeling', url: 'https://www.fda.gov/cosmetics/cosmetics-labeling-regulations/cosmetics-labeling-guide' },
  'aad-pregnancy': { name: 'AAD · Skincare during pregnancy', url: 'https://www.aad.org/public/everyday-care/skin-care-secrets/routine/pregnancy-skin-care' },
  'fda-aromatherapy': { name: 'FDA · Plant oils and skin reactions', url: 'https://www.fda.gov/cosmetics/cosmetic-products/aromatherapy' },
  'fda-alcohol': { name: 'FDA · Alcohols in cosmetics', url: 'https://www.fda.gov/cosmetics/cosmetics-labeling-claims/alcohol-free' },
  'aad-moisturizer': { name: 'AAD · Choosing a moisturizer', url: 'https://www.aad.org/public/everyday-care/skin-care-basics/dry/pick-moisturizer' },
};

function preferredScrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (checked: boolean) => void; label: string; hint?: string }) {
  return <label className="toggle-row"><span><span className="toggle-title">{label}</span>{hint && <span className="toggle-hint">{hint}</span>}</span>
    <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} />
    <span className="toggle-track" aria-hidden="true"><span /></span>
  </label>;
}

function PhotoCard() {
  const [photo, setPhoto] = useState<string>();
  const [error, setError] = useState('');
  const [dimensions, setDimensions] = useState('');
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => () => { if (photo) URL.revokeObjectURL(photo); }, [photo]);
  function choosePhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError(''); setDimensions('');
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Choose a JPG, PNG, or WebP photo.'); return; }
    if (file.size > 10 * 1024 * 1024) { setError('Please choose a photo smaller than 10 MB.'); return; }
    setPhoto(URL.createObjectURL(file));
  }
  return <section className="photo-card" aria-labelledby="photo-title">
    <div className="card-heading"><h3 id="photo-title">A photo, if you like</h3><span className="small-tag">Optional</span></div>
    <p>A private visual reference for your own observations.</p>
    <input ref={input} className="visually-hidden" type="file" tabIndex={-1} accept="image/jpeg,image/png,image/webp" aria-label="Choose a face photo" onChange={choosePhoto} />
    {photo ? <div className="photo-preview"><img src={photo} alt="Your private skin reference" onLoad={event => {
      const image = event.currentTarget;
      setDimensions(`${image.naturalWidth} × ${image.naturalHeight} pixels${Math.min(image.naturalWidth, image.naturalHeight) < 300 ? ' · A clearer photo may be easier to view.' : ''}`);
    }} onError={() => { setError('This photo could not be opened. Please choose another.'); setPhoto(undefined); if (input.current) input.current.value = ''; }} />
      <button className="photo-remove" aria-label="Remove photo" onClick={() => { setPhoto(undefined); setDimensions(''); if (input.current) input.current.value = ''; }}><X size={16} /></button>
    </div> : <button className="upload-button" onClick={() => input.current?.click()}><Upload size={19} /><span>Add a photo<span>JPG, PNG, WebP · up to 10 MB</span></span></button>}
    {dimensions && <p className="photo-dimensions">{dimensions}</p>}
    {error && <p className="error-message" role="alert">{error}</p>}
    <p className="privacy-note"><LockKeyhole size={13} /> Stays on your device. Never uploaded.</p>
    <p className="photo-limitation">Photos do not diagnose skin or determine product suitability.</p>
  </section>;
}

export default function App() {
  const [profile, setProfile] = useState<SkinProfile>(INITIAL_PROFILE);
  const [mode, setMode] = useState<'search' | 'ingredients'>('search');
  const [query, setQuery] = useState('');
  const [productName, setProductName] = useState('');
  const [ingredients, setIngredients] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [searchNotice, setSearchNotice] = useState('');
  const [searchError, setSearchError] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Product>();
  const [comparison, setComparison] = useState<Comparison>();
  const [formError, setFormError] = useState('');
  const resultRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  const analysis = useMemo(() => comparison ? analyzeIngredients(comparison.ingredients, profile) : undefined, [comparison, profile]);
  useEffect(() => () => controller.current?.abort(), []);
  const set = <K extends keyof SkinProfile>(key: K, value: SkinProfile[K]) => setProfile(current => ({ ...current, [key]: value }));

  function handleInputTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    let nextMode: 'search' | 'ingredients';
    switch (event.key) {
      case 'ArrowLeft':
      case 'ArrowRight':
        nextMode = event.currentTarget.id === 'search-tab' ? 'ingredients' : 'search';
        break;
      case 'Home':
        nextMode = 'search';
        break;
      case 'End':
        nextMode = 'ingredients';
        break;
      default:
        return;
    }
    event.preventDefault();
    setMode(nextMode);
    setFormError('');
    document.getElementById(`${nextMode}-tab`)?.focus();
  }

  async function searchProducts(event: FormEvent) {
    event.preventDefault();
    if (!query.trim()) { setSearchError('Enter a product name, barcode, or link first.'); return; }
    controller.current?.abort();
    const nextController = new AbortController();
    controller.current = nextController;
    setBusy(true); setSearchError(''); setSearchNotice(''); setProducts([]); setSelected(undefined); setComparison(undefined);
    try {
      const response = await fetch(`/api/products?q=${encodeURIComponent(query.trim())}`, { signal: nextController.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Product lookup is unavailable. You can paste the ingredient label instead.');
      setProducts(data.products); setSearchNotice(data.notice || 'Confirm the name and the current ingredient label before comparing.');
    } catch (error) {
      if (nextController.signal.aborted) return;
      setSearchError(error instanceof Error ? error.message : 'Product lookup is unavailable. Paste the ingredient label instead.');
    } finally { if (!nextController.signal.aborted) setBusy(false); }
  }
  function compare(next: Comparison) {
    if (!next.ingredients.trim()) { setFormError('Add the ingredient list from the product label to compare it.'); return; }
    setFormError(''); setComparison(next);
    window.setTimeout(() => resultRef.current?.scrollIntoView({ behavior: preferredScrollBehavior(), block: 'start' }), 50);
  }
  function tryExample() {
    setMode('ingredients'); setProductName(EXAMPLE.name); setIngredients(EXAMPLE.ingredients); setSelected(undefined); setFormError(''); setComparison(EXAMPLE);
    window.setTimeout(() => document.getElementById('workspace')?.scrollIntoView({ behavior: preferredScrollBehavior() }), 50);
  }
  function submitLabel(event: FormEvent) {
    event.preventDefault();
    compare({ name: productName.trim() || 'Your product', ingredients, example: productName === EXAMPLE.name && ingredients === EXAMPLE.ingredients });
  }
  const cautions = analysis?.flags.filter(flag => flag.level === 'caution').length || 0;

  return <>
    <header className="site-header"><div className="header-inner">
      <a className="brand" href="#" aria-label="Skinwise home"><span className="brand-icon"><Leaf size={23} strokeWidth={1.7} /></span>skinwise<span className="brand-dot">.</span></a>
      <nav aria-label="Main navigation"><a className="active" href="#workspace">Product check</a><a href="#how-it-works">How it works</a><a href="#sources">Our sources <ArrowUpRight size={13} /></a></nav>
      <span className="header-note"><ShieldCheck size={16} /> A more informed routine</span>
    </div></header>

    <main>
      <section className="hero container" aria-labelledby="hero-title">
        <div className="hero-copy"><div className="eyebrow"><span /> LESS GUESSWORK. MORE SKINCARE.</div>
          <h1 id="hero-title">Good for the hype.<br /><em>But good for your skin?</em></h1>
          <p>Get to know a product before it becomes part of your routine. Explore its ingredients, with your skin in mind.</p>
          <div className="hero-actions"><a className="primary-button" href="#workspace">Check a product <ArrowRight size={17} /></a><button className="text-button" onClick={tryExample}>Try an example <ArrowUpRight size={16} /></button></div>
          <div className="hero-footnote"><Check size={15} /> Free to explore<span>·</span><Check size={15} /> No account needed<span>·</span><Check size={15} /> Your photos stay private</div>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
          <div className="art-caption">A little clarity.<br />A kinder routine.</div>
          <div className="bottle-shadow" /><div className="skincare-bottle"><div className="bottle-cap" /><div className="bottle-body"><span className="bottle-brand">skinwise.</span><Leaf size={30} strokeWidth={1} /><span className="bottle-name">DAILY<br />SKIN CLARITY</span><span className="bottle-rule" /><span className="bottle-bottom">know your ingredients<br />care for your skin</span></div></div>
          <div className="floating-note note-top"><span className="note-symbol"><FlaskConical size={16} /></span><span>Ingredients,<br /><strong>in context.</strong></span><Check size={14} /></div>
          <div className="floating-note note-bottom"><span className="note-symbol peach"><Heart size={17} /></span><span>Made for<br /><strong>your skin story.</strong></span></div>
          <div className="art-leaf leaf-one"><Leaf size={82} strokeWidth={0.9} /></div><div className="art-leaf leaf-two"><Leaf size={52} strokeWidth={1} /></div>
        </div>
      </section>

      <section id="workspace" className="workspace container" aria-labelledby="workspace-title">
        <div className="section-intro"><div><div className="eyebrow">YOUR SKIN. YOUR STARTING POINT.</div><h2 id="workspace-title">Let’s find a little clarity.</h2></div><span className="step-label"><span>01</span> Your profile <span className="step-line" /><span>02</span> Your product</span></div>
        <div className="workspace-grid">
          <aside className="profile-panel">
            <section className="profile-card" aria-labelledby="profile-title"><div className="card-heading"><h3 id="profile-title"><Droplets size={18} /> Your skin profile</h3><span className="small-tag">Just for you</span></div>
              <p className="muted card-description">Tell us what you’ve noticed about your skin.</p>
              <fieldset className="audience-field"><legend>Choose your space</legend><div className="audience-tabs">{(['everyone', 'women', 'men'] as const).map(audience => <button type="button" key={audience} className={profile.audience === audience ? 'selected' : ''} aria-pressed={profile.audience === audience} onClick={() => set('audience', audience)}>{audience === 'everyone' ? 'Everyone' : audience === 'women' ? 'Women' : 'Men'}</button>)}</div><p className="field-note">Ingredients are assessed by skin needs, for everyone.</p></fieldset>
              <fieldset><legend>How does your skin usually feel?</legend><div className="skin-type-grid">{SKIN_TYPES.map((type, index) => <button type="button" key={type.id} aria-pressed={profile.skinType === type.id} className={`skin-type ${profile.skinType === type.id ? 'selected' : ''}`} onClick={() => set('skinType', type.id)}><span className={`skin-symbol skin-symbol-${index}`} /><span>{type.name}<small>{type.hint}</small></span>{profile.skinType === type.id && <Check size={14} />}</button>)}</div></fieldset>
              <div className="profile-divider" />
              <Toggle checked={profile.sensitive} onChange={value => set('sensitive', value)} label="My skin can be sensitive" hint="Stinging, itching, or easy irritation" />
              <fieldset className="concerns-field"><legend>What’s on your mind? <span>Optional</span></legend><div className="concern-chips">{['Breakouts', 'Dryness', 'Redness', 'Uneven tone', 'Fine lines'].map(concern => <button type="button" aria-pressed={profile.concerns.includes(concern)} className={profile.concerns.includes(concern) ? 'selected' : ''} key={concern} onClick={() => set('concerns', profile.concerns.includes(concern) ? profile.concerns.filter(item => item !== concern) : [...profile.concerns, concern])}>{concern}{profile.concerns.includes(concern) && <Check size={12} />}</button>)}</div></fieldset>
              <label className="field-label" htmlFor="allergies">Known ingredient allergies <span>Optional</span></label><input id="allergies" value={profile.allergies} maxLength={500} onChange={event => set('allergies', event.target.value)} placeholder="e.g. fragrance, lanolin" /><p className="field-note">Use names from your allergy results, separated by commas.</p>
              <details className="extra-profile"><summary>A little more context <ChevronDown size={14} /></summary><Toggle checked={profile.shaving} onChange={value => set('shaving', value)} label="My skin gets irritated after shaving" /><Toggle checked={profile.pregnant} onChange={value => set('pregnant', value)} label="Pregnant or planning pregnancy" hint="Some ingredients need clinician advice" /></details>
            </section>
            <PhotoCard />
          </aside>

          <div className="product-column">
            <section className="product-card" aria-labelledby="product-title"><div className="card-heading"><h3 id="product-title"><ScanLine size={19} /> Meet your next product</h3><span className="outline-tag"><Sparkles size={12} /> Ingredient insights</span></div><p className="muted card-description">Start with a product, or go straight to its ingredient label.</p>
              <div className="input-tabs" role="tablist" aria-label="Product input method"><button id="search-tab" role="tab" aria-selected={mode === 'search'} aria-controls="search-panel" tabIndex={mode === 'search' ? 0 : -1} className={mode === 'search' ? 'selected' : ''} onKeyDown={handleInputTabKeyDown} onClick={() => { setMode('search'); setFormError(''); }}><Search size={15} /> Find a product</button><button id="ingredients-tab" role="tab" aria-selected={mode === 'ingredients'} aria-controls="ingredients-panel" tabIndex={mode === 'ingredients' ? 0 : -1} className={mode === 'ingredients' ? 'selected' : ''} onKeyDown={handleInputTabKeyDown} onClick={() => { setMode('ingredients'); setFormError(''); }}><FlaskConical size={15} /> Paste ingredients</button></div>
              {mode === 'search' ? <div id="search-panel" role="tabpanel" aria-labelledby="search-tab"><form onSubmit={searchProducts}><label className="field-label" htmlFor="product-query">Product name, barcode, or link</label><div className="search-input-wrap"><Search size={19} /><input id="product-query" value={query} maxLength={500} onChange={event => setQuery(event.target.value)} placeholder="e.g. a moisturizer name or product link" /><button className="search-submit" disabled={busy} aria-label="Search products">{busy ? <LoaderCircle className="spin" size={19} /> : <ArrowRight size={19} />}</button></div><p className="field-note">Searches the community Open Beauty Facts catalog. Store links are used as search text.</p></form>
                {busy && <p className="lookup-status" role="status"><LoaderCircle className="spin" size={15} /> Looking for an ingredient label…</p>}
                {searchError && <div className="lookup-error" role="alert"><TriangleAlert size={18} /><div><strong>We couldn’t look up this product.</strong><p>{searchError}</p><button className="inline-link" onClick={() => setMode('ingredients')}>Paste the label instead <ArrowRight size={13} /></button></div></div>}
                {searchNotice && <p className="lookup-notice" role="status"><Info size={14} />{searchNotice}</p>}
                {products.length > 0 && <div className="product-list">{products.map(product => <button className={`product-option ${selected?.id === product.id ? 'selected' : ''}`} key={product.id} onClick={() => { setSelected(product); setComparison(undefined); setFormError(''); }}><span className="product-option-icon"><FlaskConical size={20} /></span><span><strong>{product.name}</strong><small>{product.brand || 'Brand not listed'} · {product.ingredients ? 'Ingredient label available' : 'Ingredient label missing'}</small></span>{selected?.id === product.id ? <Check size={18} /> : <ArrowRight size={16} />}</button>)}</div>}
                {selected && <div className="selected-product"><div className="selected-product-heading"><h4>{selected.name}</h4><a href={selected.sourceUrl} target="_blank" rel="noreferrer">View source <ExternalLink size={13} /></a></div>{selected.ingredients ? <><p className="selected-ingredients">{selected.ingredients}</p><p className="field-note">Check these against your package: formulas can change by region and over time.</p><button className="primary-button compare-button" onClick={() => compare({ name: selected.name, ingredients: selected.ingredients, example: false, sourceUrl: selected.sourceUrl, updatedAt: selected.updatedAt })}>Compare with my profile <ArrowRight size={16} /></button></> : <><p>This entry has no ingredient label, so we can’t compare it yet.</p><button className="secondary-button" onClick={() => { setMode('ingredients'); setProductName(selected.name); setIngredients(''); }}>Add the label yourself <ArrowRight size={15} /></button></>}</div>}
                {!selected && products.length === 0 && !busy && <div className="search-empty"><div className="empty-illustration"><FlaskConical size={31} strokeWidth={1.2} /><span><Leaf size={18} /></span></div><h4>A product is more than its promise.</h4><p>Find the ingredients behind the packaging.<br />We’ll help you put them in perspective.</p><button className="inline-link" onClick={tryExample}>See an example comparison <ArrowUpRight size={14} /></button></div>}
              </div> : <div id="ingredients-panel" role="tabpanel" aria-labelledby="ingredients-tab"><form onSubmit={submitLabel}><label className="field-label" htmlFor="product-name">Product name <span>Optional</span></label><input id="product-name" value={productName} maxLength={200} onChange={event => { setProductName(event.target.value); setComparison(undefined); }} placeholder="What is the product called?" /><label className="field-label ingredients-label" htmlFor="ingredient-list">Full ingredient list</label><textarea id="ingredient-list" value={ingredients} maxLength={15000} rows={6} onChange={event => { setIngredients(event.target.value); setComparison(undefined); }} placeholder="Paste the INCI list exactly as it appears on the package, e.g. Aqua, Glycerin, Niacinamide…" /><p className="field-note">Use the current package label. Commas, semicolons, and line breaks are supported.</p>{productName === EXAMPLE.name && ingredients === EXAMPLE.ingredients && <p className="example-notice"><Info size={14} /> Illustrative formula — this is not a verified real product.</p>}<button className="primary-button compare-button" type="submit">Compare with my profile <ArrowRight size={16} /></button></form></div>}
              {formError && <p className="error-message" role="alert">{formError}</p>}
              <div className="product-card-footnote"><ShieldCheck size={15} /><span>Clear ingredient guidance. No guaranteed safety score.</span></div>
            </section>

            {analysis && comparison ? <section ref={resultRef} className="results-card" aria-labelledby="results-title" aria-live="polite"><div className="result-eyebrow"><span className="eyebrow">YOUR INGREDIENT COMPARISON</span>{comparison.example && <span className="small-tag">Example formula</span>}</div><h3 id="results-title">{comparison.name}</h3><div className={`result-summary ${cautions ? 'with-caution' : ''}`}><span className="summary-icon">{cautions ? <TriangleAlert size={22} /> : <Info size={22} />}</span><div><strong>{cautions ? `${cautions} ${cautions === 1 ? 'point' : 'points'} to review` : analysis.status === 'limited' ? 'A little more context would help' : 'Here’s what the label tells us'}</strong><p>{analysis.summary}</p></div></div>
              <div className="result-meta"><span>{analysis.ingredientCount} ingredients listed</span><span>{analysis.recognizedCount} of {analysis.ingredientCount} names recognized</span><span>Based on your current profile</span></div>
              <div className="ingredient-flags">{analysis.flags.map(flag => <article className={`ingredient-flag flag-${flag.level}`} key={flag.id}><span className="flag-icon">{flag.level === 'caution' ? <TriangleAlert size={17} /> : flag.level === 'positive' ? <Droplets size={17} /> : <Info size={17} />}</span><div><div className="flag-title"><h4>{flag.title}</h4><span>{flag.level === 'caution' ? 'Review' : flag.level === 'positive' ? 'Ingredient role' : 'Keep in mind'}</span></div><p>{flag.detail}</p><div className="flag-ingredients">{flag.ingredients.map(ingredient => <span key={ingredient}>{ingredient}</span>)}</div>{SOURCES[flag.sourceId] && <a className="source-link" href={SOURCES[flag.sourceId].url} target="_blank" rel="noreferrer">{SOURCES[flag.sourceId].name}<ArrowUpRight size={12} /></a>}</div></article>)}</div>
              <details className="comparison-details"><summary>What this comparison can and can’t tell you <ChevronDown size={15} /></summary><ul>{analysis.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul></details>
              <div className="next-step"><Leaf size={20} /><div><strong>Start small. Give your skin time.</strong><p>Follow the label and test a new product on a small area first. Stop if it causes irritation; a dermatologist can help with persistent symptoms.</p></div></div>
              {comparison.sourceUrl && <p className="result-source">Label source: <a href={comparison.sourceUrl} target="_blank" rel="noreferrer">Open Beauty Facts <ExternalLink size={12} /></a>{comparison.updatedAt && ` · Entry updated ${new Date(comparison.updatedAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`}</p>}
              <p className="result-disclaimer">Educational guidance, not a diagnosis or a prediction of how your skin will react. No dermatologist has reviewed this comparison.</p>
            </section> : <section className="clarity-note"><span className="clarity-icon"><Sun size={23} strokeWidth={1.4} /></span><div><h3>Better decisions start with better questions.</h3><p>Is the label complete? Does it mention an ingredient you react to? Does it suit how your skin feels today? Let’s take it one step at a time.</p></div></section>}
            <div className="trust-strip"><span><LockKeyhole size={15} /> Photos stay on your device</span><span><FlaskConical size={15} /> Transparent ingredient rules</span><span><Heart size={15} /> All skin is welcome</span></div>
          </div>
        </div>
      </section>

      <section id="how-it-works" className="how-section container" aria-labelledby="how-title"><div className="section-heading"><div className="eyebrow">A THOUGHTFUL FIRST STEP</div><h2 id="how-title">Less guessing. More understanding.</h2><p>A simple way to make your next skincare choice more informed.</p></div><div className="how-grid"><article><span className="how-number">01</span><Droplets size={24} strokeWidth={1.4} /><h3>Tell your skin story</h3><p>Your skin type, sensitivities, and known allergies give ingredients their context.</p></article><article><span className="how-number">02</span><ScanLine size={25} strokeWidth={1.4} /><h3>Look beyond the label</h3><p>Find a product or paste its ingredient list. Always check the current packaging.</p></article><article><span className="how-number">03</span><Leaf size={25} strokeWidth={1.4} /><h3>Make a considered choice</h3><p>Review ingredient flags and their limits. Bring unresolved concerns to a dermatologist.</p></article></div></section>

      <section id="sources" className="sources-section container" aria-labelledby="sources-title"><div className="sources-copy"><span className="eyebrow">INFORMATION WITH CONTEXT</span><h2 id="sources-title">Sources you can explore.<br /><em>Limits you can see.</em></h2><p>Our educational rules link to public skincare guidance. Product lookups use a community catalog, where labels can be incomplete or out of date.</p><p className="sources-limitation">This prototype has not been clinically validated or reviewed by dermatologists. These resources are references, not an endorsement.</p></div><div className="source-cards"><a href={SOURCES['aad-test'].url} target="_blank" rel="noreferrer"><span className="source-logo">AAD</span><span><strong>American Academy of Dermatology</strong><small>Guidance on testing new skincare products</small></span><ArrowUpRight size={19} /></a><a href={SOURCES['fda-labels'].url} target="_blank" rel="noreferrer"><span className="source-logo">FDA</span><span><strong>U.S. Food & Drug Administration</strong><small>Understanding cosmetics ingredient labels</small></span><ArrowUpRight size={19} /></a><a href="https://world.openbeautyfacts.org" target="_blank" rel="noreferrer"><span className="source-logo source-logo-leaf"><Leaf size={23} /></span><span><strong>Open Beauty Facts</strong><small>Community product data · availability varies</small></span><ArrowUpRight size={19} /></a><a href="https://github.com/openfoodfacts/openfoodfacts-server/blob/main/docs/api/index.md" target="_blank" rel="noreferrer"><span className="source-logo">API</span><span><strong>Product Opener documentation</strong><small>Data completeness, licensing, and API limits</small></span><ArrowUpRight size={19} /></a></div></section>
      <div className="gentle-reminder container"><Info size={18} /><p>Skin is personal. An ingredient list can inform your decision, but it cannot promise a reaction-free experience. Seek medical care for a severe reaction or symptoms that persist.</p></div>
    </main>
    <footer className="container"><a className="brand" href="#"><span className="brand-icon"><Leaf size={21} strokeWidth={1.7} /></span>skinwise<span className="brand-dot">.</span></a><p>A little clarity for your skincare.</p><a href="#workspace">Back to your skin <ArrowUpRight size={14} /></a></footer>
  </>;
}
