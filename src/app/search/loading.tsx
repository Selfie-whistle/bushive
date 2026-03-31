import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row gap-8">
          <div className="w-full md:w-1/4">
             <Card>
                <CardHeader><Skeleton className="h-6 w-2/3" /></CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                    <Skeleton className="h-8 w-full" />
                </CardContent>
             </Card>
          </div>
          <div className="w-full md:w-3/4 space-y-4">
            {[...Array(3)].map((_, i) => (
                <Card key={i} className="w-full">
                    <CardContent className="p-4 flex flex-col md:flex-row gap-4">
                        <div className="w-full md:w-3/4 space-y-2">
                            <Skeleton className="h-6 w-1/2" />
                            <Skeleton className="h-4 w-1/3" />
                            <div className="flex items-center gap-4">
                                <Skeleton className="h-5 w-1/4" />
                                <Skeleton className="h-5 w-1/4" />
                            </div>
                        </div>
                        <div className="w-full md:w-1/4 flex flex-col items-end justify-between">
                            <Skeleton className="h-8 w-1/2" />
                             <Skeleton className="h-10 w-full" />
                        </div>
                    </CardContent>
                </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
