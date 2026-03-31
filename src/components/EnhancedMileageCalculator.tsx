
'use client';

import React, { useState, useEffect } from "react";
import { Fuel, IndianRupee, History, Calculator, X, Plus, BarChart, TrendingUp, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "./ui/card";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/tabs";
import { Table, TableBody, TD as TableCell, TH as TableHead, TableHeader, TR as TableRow } from "./ui/table";

interface MileageEntry {
  id: string;
  date: string;
  startKm: number;
  endKm: number;
  distance: number;
  fuelQuantity: number;
  pricePerLitre: number;
  totalCost: number;
  mileage: number;
}

export default function MileageCalculator() {
  const [startKm, setStartKm] = useState<string>("");
  const [endKm, setEndKm] = useState<string>("");
  const [fuelQuantity, setFuelQuantity] = useState<string>("");
  const [pricePerLitre, setPricePerLitre] = useState<string>("");
  const [totalCost, setTotalCost] = useState<string>("");
  const [mileage, setMileage] = useState<number | null>(null);
  const [history, setHistory] = useState<MileageEntry[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<"calculator" | "history">("calculator");

  // Initialize with sample data for demonstration
  useEffect(() => {
    const sampleHistory: MileageEntry[] = [
      {
        id: "1",
        date: new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        startKm: 15000,
        endKm: 15500,
        distance: 500,
        fuelQuantity: 60,
        pricePerLitre: 95.50,
        totalCost: 5730,
        mileage: 8.33
      },
      {
        id: "2",
        date: new Date(Date.now() - 86400000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
        startKm: 14500,
        endKm: 15000,
        distance: 500,
        fuelQuantity: 62,
        pricePerLitre: 94.80,
        totalCost: 5877.60,
        mileage: 8.06
      }
    ];
    setHistory(sampleHistory);
  }, []);

  // Calculate total cost automatically when fuel quantity or price changes
  useEffect(() => {
    const quantity = parseFloat(fuelQuantity);
    const price = parseFloat(pricePerLitre);
    
    if (!isNaN(quantity) && !isNaN(price) && quantity > 0 && price > 0) {
      const cost = quantity * price;
      setTotalCost(cost.toFixed(2));
    } else {
      setTotalCost("");
    }
  }, [fuelQuantity, pricePerLitre]);

  const validateInputs = (): boolean => {
    const newErrors: Record<string, string> = {};
    
    const start = parseFloat(startKm);
    const end = parseFloat(endKm);
    const quantity = parseFloat(fuelQuantity);
    const price = parseFloat(pricePerLitre);

    if (isNaN(start) || start < 0) {
      newErrors.startKm = "Please enter a valid starting kilometer";
    }
    
    if (isNaN(end) || end <= start) {
      newErrors.endKm = "Ending kilometer must be greater than starting";
    }
    
    if (isNaN(quantity) || quantity <= 0) {
      newErrors.fuelQuantity = "Please enter a valid fuel quantity";
    }
    
    if (isNaN(price) || price <= 0) {
      newErrors.pricePerLitre = "Please enter a valid price per litre";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const calculateMileage = () => {
    if (!validateInputs()) return;

    const start = parseFloat(startKm);
    const end = parseFloat(endKm);
    const quantity = parseFloat(fuelQuantity);
    const price = parseFloat(pricePerLitre);
    const cost = parseFloat(totalCost);

    const distance = end - start;
    const calculatedMileage = distance / quantity;
    
    setMileage(parseFloat(calculatedMileage.toFixed(2)));

    // Add to history
    const newEntry: MileageEntry = {
      id: Date.now().toString(),
      date: new Date().toLocaleDateString('en-IN', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      }),
      startKm: start,
      endKm: end,
      distance: distance,
      fuelQuantity: quantity,
      pricePerLitre: price,
      totalCost: cost,
      mileage: parseFloat(calculatedMileage.toFixed(2))
    };

    setHistory(prev => [newEntry, ...prev]);
    setActiveTab("history");
  };

  const resetForm = () => {
    setStartKm("");
    setEndKm("");
    setFuelQuantity("");
    setPricePerLitre("");
    setTotalCost("");
    setMileage(null);
    setErrors({});
  };

  const getMileageEfficiency = (mileageValue: number): { 
    label: string; 
    color: string; 
    icon: React.ReactNode;
    description: string;
  } => {
    if (mileageValue >= 10) return { 
      label: "Excellent", 
      color: "bg-green-100 text-green-800 border-green-200", 
      icon: <TrendingUp className="w-4 h-4" />,
      description: "Highly efficient"
    };
    if (mileageValue >= 7) return { 
      label: "Good", 
      color: "bg-blue-100 text-blue-800 border-blue-200", 
      icon: <TrendingUp className="w-4 h-4" />,
      description: "Above average"
    };
    if (mileageValue >= 5) return { 
      label: "Average", 
      color: "bg-yellow-100 text-yellow-800 border-yellow-200", 
      icon: <BarChart className="w-4 h-4" />,
      description: "Normal efficiency"
    };
    return { 
      label: "Poor", 
      color: "bg-red-100 text-red-800 border-red-200", 
      icon: <TrendingDown className="w-4 h-4" />,
      description: "Needs improvement"
    };
  };

  const clearHistory = () => {
    if (confirm("Are you sure you want to clear all history?")) {
      setHistory([]);
    }
  };

  return (
    <Card className="w-full max-w-4xl mx-auto font-sans shadow-xl border-muted/20">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 pb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-primary/10 rounded-xl">
              <Fuel className="w-8 h-8 text-primary" />
            </div>
            <div>
              <CardTitle className="text-3xl font-bold text-gray-800 tracking-tight font-headline">
                Mileage Calculator
              </CardTitle>
              <CardDescription className="text-gray-600 text-base font-medium font-sans mt-1">
                Calculate fuel efficiency for your vehicle
              </CardDescription>
            </div>
          </div>
          <Badge variant="secondary" className="text-sm font-semibold py-1.5 px-3 font-mono">
            {history.length} records
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="pt-8">
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "calculator" | "history")}>
          <TabsList className="grid w-full grid-cols-2 bg-muted/30 p-1 rounded-lg">
            <TabsTrigger value="calculator" className="flex items-center gap-2 text-sm font-semibold data-[state=active]:font-bold transition-all duration-200 font-headline">
              <Calculator className="w-4 h-4" />
              Calculator
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2 text-sm font-semibold data-[state=active]:font-bold transition-all duration-200 font-headline">
              <History className="w-4 h-4" />
              History ({history.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calculator" className="space-y-8 pt-6">
            {/* Input Form */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left Column - Basic Info */}
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-3 tracking-wide font-headline">
                    <span className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shadow-sm">
                      1
                    </span>
                    Starting Kilometer
                  </label>
                  <Input
                    type="number"
                    placeholder="e.g., 15000"
                    value={startKm}
                    onChange={(e) => setStartKm(e.target.value)}
                    className={`h-12 text-base font-medium placeholder:font-normal ${errors.startKm ? "border-red-500 ring-red-500/20" : "focus:ring-primary/20"}`}
                  />
                  {errors.startKm && (
                    <p className="text-xs text-red-600 font-medium">{errors.startKm}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-3 tracking-wide font-headline">
                    <span className="w-7 h-7 rounded-full bg-primary text-white flex items-center justify-center text-sm font-bold shadow-sm">
                      2
                    </span>
                    Ending Kilometer
                  </label>
                  <Input
                    type="number"
                    placeholder="e.g., 15500"
                    value={endKm}
                    onChange={(e) => setEndKm(e.target.value)}
                    className={`h-12 text-base font-medium placeholder:font-normal ${errors.endKm ? "border-red-500 ring-red-500/20" : "focus:ring-primary/20"}`}
                  />
                  {errors.endKm && (
                    <p className="text-xs text-red-600 font-medium">{errors.endKm}</p>
                  )}
                </div>

                <div className="p-5 bg-gradient-to-r from-primary/5 to-blue-50 rounded-xl border border-primary/10">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700 tracking-wide font-headline">Distance Covered</span>
                    <span className="text-xl font-bold text-primary font-mono">
                      {startKm && endKm && !errors.startKm && !errors.endKm
                        ? `${(parseFloat(endKm) - parseFloat(startKm)).toFixed(0)} km`
                        : "—"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Right Column - Fuel Details */}
              <div className="space-y-6">
                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2 tracking-wide font-headline">
                    <Fuel className="w-5 h-5 text-primary" />
                    Fuel Quantity (Litres)
                  </label>
                  <Input
                    type="number"
                    step="0.1"
                    placeholder="e.g., 60.5"
                    value={fuelQuantity}
                    onChange={(e) => setFuelQuantity(e.target.value)}
                    className={`h-12 text-base font-medium placeholder:font-normal ${errors.fuelQuantity ? "border-red-500 ring-red-500/20" : "focus:ring-primary/20"}`}
                  />
                  {errors.fuelQuantity && (
                    <p className="text-xs text-red-600 font-medium">{errors.fuelQuantity}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700 flex items-center gap-2 tracking-wide font-headline">
                    <IndianRupee className="w-5 h-5 text-primary" />
                    Price per Litre (₹)
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="e.g., 95.50"
                    value={pricePerLitre}
                    onChange={(e) => setPricePerLitre(e.target.value)}
                    className={`h-12 text-base font-medium placeholder:font-normal ${errors.pricePerLitre ? "border-red-500 ring-red-500/20" : "focus:ring-primary/20"}`}
                  />
                  {errors.pricePerLitre && (
                    <p className="text-xs text-red-600 font-medium">{errors.pricePerLitre}</p>
                  )}
                </div>

                <div className="space-y-3">
                  <label className="text-sm font-semibold text-gray-700 font-headline">Total Fuel Cost (₹)</label>
                  <Input
                    type="number"
                    value={totalCost}
                    readOnly
                    className="h-12 text-base font-bold bg-muted/50 text-gray-800 font-mono"
                  />
                  <p className="text-xs text-gray-500 font-medium italic">
                    Calculated automatically from quantity × price
                  </p>
                </div>
              </div>
            </div>

            <Separator className="bg-gradient-to-r from-transparent via-gray-200 to-transparent h-[2px]" />

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-end">
              <Button
                variant="outline"
                onClick={resetForm}
                className="gap-2 h-12 px-6 text-sm font-semibold border-gray-300 hover:border-red-300 hover:bg-red-50 hover:text-red-600 transition-colors font-headline"
              >
                <X className="w-4 h-4" />
                Clear All
              </Button>
              <Button
                onClick={calculateMileage}
                disabled={!startKm || !endKm || !fuelQuantity || !pricePerLitre}
                className="gap-2 h-12 px-8 text-sm font-semibold bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary shadow-lg hover:shadow-xl transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed font-headline"
              >
                <Calculator className="w-5 h-5" />
                Calculate Mileage
              </Button>
            </div>

            {/* Result Display */}
            {mileage !== null && (
              <div className="mt-8 p-8 bg-gradient-to-br from-blue-50/50 to-primary/5 rounded-2xl border border-primary/20 shadow-lg">
                <div className="flex flex-col lg:flex-row items-center justify-between gap-8">
                  <div className="text-center lg:text-left">
                    <p className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2 font-headline">
                      Calculated Mileage
                    </p>
                    <div className="flex flex-col lg:flex-row items-center gap-4">
                      <p className="text-5xl font-black text-gray-900 font-headline tracking-tight">
                        {mileage}
                        <span className="text-2xl font-semibold text-gray-600 ml-2">km/l</span>
                      </p>
                      <div className="flex flex-col items-center lg:items-start gap-1">
                        {(() => {
                          const efficiency = getMileageEfficiency(mileage);
                          return (
                            <Badge className={`${efficiency.color} border px-4 py-2.5 rounded-full font-semibold flex items-center gap-2 font-headline`}>
                              {efficiency.icon}
                              {efficiency.label}
                            </Badge>
                          );
                        })()}
                        <p className="text-xs text-gray-500 font-medium">
                          {getMileageEfficiency(mileage).description}
                        </p>
                      </div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-center">
                    <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                      <p className="text-xs text-gray-500 font-medium mb-1 font-headline">Distance</p>
                      <p className="text-xl font-bold text-gray-800 font-mono">
                        {(parseFloat(endKm) - parseFloat(startKm)).toFixed(0)} km
                      </p>
                    </div>
                    <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                      <p className="text-xs text-gray-500 font-medium mb-1 font-headline">Fuel Used</p>
                      <p className="text-xl font-bold text-gray-800 font-mono">
                        {fuelQuantity} L
                      </p>
                    </div>
                    <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                      <p className="text-xs text-gray-500 font-medium mb-1 font-headline">Cost per km</p>
                      <p className="text-xl font-bold text-gray-800 font-mono">
                        ₹{(parseFloat(totalCost) / (parseFloat(endKm) - parseFloat(startKm))).toFixed(2)}
                      </p>
                    </div>
                    <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm">
                      <p className="text-xs text-gray-500 font-medium mb-1 font-headline">Total Cost</p>
                      <p className="text-xl font-bold text-gray-800 font-mono">
                        ₹{parseFloat(totalCost).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>

                <Button
                  variant="outline"
                  onClick={() => setActiveTab("history")}
                  className="w-full mt-8 gap-2 h-12 font-semibold border-primary/20 hover:border-primary/40 hover:bg-primary/5 transition-colors font-headline"
                >
                  <History className="w-5 h-5" />
                  View in History
                </Button>
              </div>
            )}
          </TabsContent>

          <TabsContent value="history" className="pt-6">
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-2xl font-bold text-gray-800 font-headline">
                    Calculation History
                  </h3>
                  <p className="text-gray-600 font-medium font-headline">
                    {history.length} mileage records
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="default"
                  onClick={clearHistory}
                  disabled={history.length === 0}
                  className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 hover:border-red-300 font-semibold font-headline"
                >
                  Clear History
                </Button>
              </div>

              {history.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-gray-200 rounded-2xl bg-gradient-to-b from-gray-50/50 to-white">
                  <BarChart className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500 text-lg font-medium mb-2 font-headline">No calculations yet</p>
                  <p className="text-gray-400 text-sm mb-6 font-headline">
                    Calculate your first mileage to see it here
                  </p>
                  <Button
                    variant="default"
                    className="gap-2 px-6 font-semibold font-headline"
                    onClick={() => setActiveTab("calculator")}
                  >
                    <Plus className="w-5 h-5" />
                    New Calculation
                  </Button>
                </div>
              ) : (
                <>
                  <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader className="bg-gray-50/80">
                          <TableRow className="hover:bg-transparent">
                            <TableHead className="font-bold text-gray-700 py-4 font-headline">Date</TableHead>
                            <TableHead className="font-bold text-gray-700 font-headline">Distance</TableHead>
                            <TableHead className="font-bold text-gray-700 font-headline">Fuel Used</TableHead>
                            <TableHead className="font-bold text-gray-700 font-headline">Price/L</TableHead>
                            <TableHead className="font-bold text-gray-700 font-headline">Total Cost</TableHead>
                            <TableHead className="font-bold text-gray-700 text-right font-headline">Mileage</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {history.map((entry) => {
                            const efficiency = getMileageEfficiency(entry.mileage);
                            return (
                              <TableRow key={entry.id} className="hover:bg-muted/50 border-b border-gray-100 last:border-0">
                                <TableCell className="font-medium py-4 font-mono text-gray-800">
                                  {entry.date}
                                </TableCell>
                                <TableCell className="font-semibold text-gray-800 font-headline">
                                  {entry.distance} km
                                </TableCell>
                                <TableCell className="font-semibold text-gray-800 font-headline">
                                  {entry.fuelQuantity} L
                                </TableCell>
                                <TableCell className="font-semibold text-gray-800 font-headline">
                                  ₹{entry.pricePerLitre.toFixed(2)}
                                </TableCell>
                                <TableCell className="font-semibold text-gray-800 font-headline">
                                  ₹{entry.totalCost.toFixed(2)}
                                </TableCell>
                                <TableCell className="text-right py-4">
                                  <div className="flex flex-col items-end gap-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xl font-black text-gray-900 font-headline">
                                        {entry.mileage}
                                      </span>
                                      <span className="text-gray-600 font-medium font-headline">km/l</span>
                                    </div>
                                    <Badge className={`${efficiency.color} border px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1`}>
                                      {efficiency.icon}
                                      {efficiency.label}
                                    </Badge>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  </div>

                  {/* Summary Statistics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6 bg-gradient-to-r from-primary/5 to-blue-50/50 rounded-xl border border-primary/10">
                    <div className="text-center p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 font-headline">
                        Average Mileage
                      </p>
                      <p className="text-2xl font-black text-gray-900 font-headline">
                        {(history.reduce((sum, entry) => sum + entry.mileage, 0) / history.length).toFixed(2)} km/l
                      </p>
                    </div>
                    <div className="text-center p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 font-headline">
                        Total Distance
                      </p>
                      <p className="text-2xl font-black text-gray-900 font-headline">
                        {history.reduce((sum, entry) => sum + entry.distance, 0)} km
                      </p>
                    </div>
                    <div className="text-center p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 font-headline">
                        Total Fuel Used
                      </p>
                      <p className="text-2xl font-black text-gray-900 font-headline">
                        {history.reduce((sum, entry) => sum + entry.fuelQuantity, 0).toFixed(1)} L
                      </p>
                    </div>
                    <div className="text-center p-4 bg-white rounded-lg border border-gray-100 shadow-sm">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 font-headline">
                        Total Cost
                      </p>
                      <p className="text-2xl font-black text-gray-900 font-headline">
                        ₹{history.reduce((sum, entry) => sum + entry.totalCost, 0).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
