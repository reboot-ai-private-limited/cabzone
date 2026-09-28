'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';

interface PlaceSearchProps {
  map: google.maps.Map | null;
}

export function PlaceSearch({ map }: PlaceSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!map || !inputRef.current || !window.google?.maps?.places?.Autocomplete) {
      return;
    }

    if (!autocompleteRef.current) {
      const autocomplete = new window.google.maps.places.Autocomplete(inputRef.current, {
        componentRestrictions: { country: 'in' },
        fields: ['geometry', 'name', 'formatted_address'],
      });

      autocomplete.bindTo('bounds', map);

      autocomplete.addListener('place_changed', () => {
        const place = autocomplete.getPlace();
        if (!place.geometry || !place.geometry.location) {
          return;
        }

        if (place.geometry.viewport) {
          map.fitBounds(place.geometry.viewport);
        } else {
          map.setCenter(place.geometry.location);
          map.setZoom(15);
        }

        setQuery(place.name || place.formatted_address || '');
      });

      autocompleteRef.current = autocomplete;
    }
  }, [map]);

  const handleClear = () => {
    setQuery('');
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  return (
    <div className="relative flex items-center">
      <div className="absolute left-2.5 text-slate-400 pointer-events-none">
        <Search className="w-3.5 h-3.5" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search place or landmark..."
        className="w-56 pl-8 pr-7 py-1.5 bg-slate-900/90 backdrop-blur-xs text-white placeholder-slate-400 text-xs rounded-lg border border-slate-700 focus:outline-none focus:border-indigo-500 shadow-md transition-colors"
      />
      {query && (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 text-slate-400 hover:text-white"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
