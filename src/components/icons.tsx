export const SeatAvailableIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--background))" />
    </svg>
);
  
export const SeatBookedIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="hsl(var(--muted))" stroke="hsl(var(--muted-foreground))" />
    </svg>
);

export const SeatFemaleIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="#FBCFE8" stroke="#DB2777" />
    </svg>
);

export const SeatSelectedIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="3" width="18" height="18" rx="2" ry="2" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" />
    </svg>
);

export const SleeperAvailableIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="64" height="32" viewBox="0 0 64 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <rect x="1" y="1" width="62" height="30" rx="4" stroke="#9ca3af" strokeWidth="2" fill="white"/>
        <path d="M52 6C52 4.34315 53.3431 3 55 3H59C60.6569 3 62 4.34315 62 6V26C62 27.6569 60.6569 29 59 29H55C53.3431 29 52 27.6569 52 26V6Z" fill="#e2e8f0"/>
    </svg>
);

export const SleeperBookedIcon = (props: React.SVGProps<SVGSVGElement> & { gender?: 'male' | 'female' }) => {
    const fillColor = props.gender === 'female' ? '#db2777' : '#2563eb'; // pink-600 or blue-600
    return (
        <svg width="64" height="32" viewBox="0 0 64 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
            <rect x="1" y="1" width="62" height="30" rx="4" stroke={fillColor} strokeWidth="2" fill={fillColor}/>
            <text x="32" y="19" textAnchor="middle" fontSize="10" fontWeight="normal" fill="white" className="font-sans">SOLD</text>
        </svg>
    );
};

export const SleeperSelectedIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg width="64" height="32" viewBox="0 0 64 32" fill="none" xmlns="http://www.w3.org/2000/svg" {...props}>
        <rect x="1" y="1" width="62" height="30" rx="4" fill="#dc2626" stroke="#991b1b" strokeWidth="2"/>
    </svg>
);
  
export const SteeringWheelIcon = (props: React.SVGProps<SVGSVGElement>) => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="2" />
        <path d="M12 14v6" />
        <path d="M12 8V2" />
        <path d="m16 16 -4-4 -4 4" />
        <path d="m8 8 4 4 4-4" />
    </svg>
);
