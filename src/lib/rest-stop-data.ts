
export type RestStop = {
  id: string;
  name: string;
  locationName: string; // The general location name to match against bus route points
  amenities: string[];
  description: string;
  duration: number; // Duration of the stop in minutes
};

export const restStopData: RestStop[] = [
  {
    id: 'rs-thalayolaparambu-1',
    name: 'Hotel Saravana Bhavan',
    locationName: 'Thalayolaparambu',
    amenities: ['Restaurant', 'Restrooms', 'Coffee/Tea'],
    description: 'The pure-veg halt on your route.',
    duration: 20,
  },
];
