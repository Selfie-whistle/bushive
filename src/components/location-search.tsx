
'use client';

import * as React from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverAnchor } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface LocationSearchProps {
  value: string;
  onValueChange: (value: string) => void;
  locations: string[];
  placeholder: string;
  icon?: React.ReactNode;
}

export function LocationSearch({
  value,
  onValueChange,
  locations,
  placeholder,
  icon,
}: LocationSearchProps) {
  const [open, setOpen] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const safeLocations = React.useMemo(
    () => (Array.isArray(locations) ? locations : []),
    [locations]
  );
  
  const filteredLocations = React.useMemo(() => {
    if (!value.trim()) return [];
  
    const query = value.toLowerCase();
  
    return safeLocations.filter(location =>
      location.toLowerCase().startsWith(query)
    );
  }, [value, safeLocations]);


  return (
    <Command shouldFilter={false}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div className="relative flex items-center w-full">
              <div className="pointer-events-none">
                {icon}
              </div>
              <CommandInput
                  ref={inputRef}
                  value={value}
                  onValueChange={onValueChange}
                  placeholder={placeholder}
                  onFocus={() => setOpen(true)}
                  onBlur={() => setTimeout(() => setOpen(false), 150)}
                  className="
                    w-full h-12 pl-2
                    border-0
                    bg-transparent
                    shadow-none
                    font-normal
                    focus-visible:ring-0
                    [&>svg]:hidden
                  "
                  role="combobox"
                  aria-expanded={open}
              />
          </div>
        </PopoverAnchor>

        {open && (
          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
              <CommandList>
                <CommandEmpty>No locations found.</CommandEmpty>
                <CommandGroup>
                  {filteredLocations.map((location) => (
                    <CommandItem
                      key={location}
                      value={location}
                      onSelect={() => {
                        onValueChange(location);
                        setOpen(false);
                        inputRef.current?.blur();
                      }}
                    >
                      {location}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
          </PopoverContent>
        )}
      </Popover>
    </Command>
  );
}
