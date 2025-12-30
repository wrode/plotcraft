import { createSignal, createEffect, Show, For } from 'solid-js';
import { searchAddresses } from '../api/geonorge';

export default function AddressSearch(props) {
  const [query, setQuery] = createSignal('');
  const [results, setResults] = createSignal([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal(null);
  const [showResults, setShowResults] = createSignal(false);

  let debounceTimer;

  const handleInput = (e) => {
    const value = e.target.value;
    setQuery(value);
    setError(null);

    clearTimeout(debounceTimer);

    if (value.length < 2) {
      setResults([]);
      setShowResults(false);
      return;
    }

    debounceTimer = setTimeout(async () => {
      setLoading(true);
      try {
        const addresses = await searchAddresses(value);
        setResults(addresses);
        setShowResults(true);
      } catch (err) {
        setError(err.message);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  };

  const handleSelect = (address) => {
    setQuery(address.text);
    setShowResults(false);
    props.onSelect?.(address);
  };

  const handleBlur = () => {
    // Delay to allow click on results
    setTimeout(() => setShowResults(false), 200);
  };

  return (
    <div class="search-box">
      <label for="address-search">Søk etter adresse</label>
      <div class="search-input-wrapper">
        <input
          id="address-search"
          type="text"
          class="search-input"
          placeholder="F.eks. Storgata 1, Oslo"
          value={query()}
          onInput={handleInput}
          onFocus={() => results().length > 0 && setShowResults(true)}
          onBlur={handleBlur}
        />

        <Show when={showResults() && (results().length > 0 || loading())}>
          <div class="search-results">
            <Show when={loading()}>
              <div class="loading">Søker...</div>
            </Show>

            <Show when={!loading()}>
              <For each={results()}>
                {(address) => (
                  <div
                    class="search-result-item"
                    onClick={() => handleSelect(address)}
                  >
                    <div class="address">{address.text}</div>
                    <div class="details">
                      {address.postalCode} {address.postalPlace}, {address.municipality}
                    </div>
                  </div>
                )}
              </For>
            </Show>
          </div>
        </Show>
      </div>

      <Show when={error()}>
        <div class="error">{error()}</div>
      </Show>
    </div>
  );
}
