'use client';

import { useState } from 'react';
import { CreditCard, Landmark, Wallet, QrCode } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface PaymentMethodsProps {
    onPaymentMethodSelect: (method: string) => void;
}

export function PaymentMethods({ onPaymentMethodSelect }: PaymentMethodsProps) {
    const [activeMethod, setActiveMethod] = useState<string | undefined>();
    const [selectedMethod, setSelectedMethod] = useState<string | undefined>();

    const handleSelect = (method: string) => {
        setSelectedMethod(method);
        onPaymentMethodSelect(method);
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle>Choose Payment Method</CardTitle>
            </CardHeader>
            <CardContent>
                <Accordion type="single" collapsible value={activeMethod} onValueChange={setActiveMethod}>
                    <AccordionItem value="card">
                        <AccordionTrigger>
                            <div className="flex items-center gap-3">
                                <CreditCard className="h-6 w-6 text-professional-blue" />
                                <span className="font-medium">Credit/Debit Card</span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4 pt-4">
                            <div className="space-y-2">
                                <Label htmlFor="card-number">Card Number</Label>
                                <Input id="card-number" placeholder="0000 0000 0000 0000" />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="card-name">Cardholder Name</Label>
                                <Input id="card-name" placeholder="John Doe" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="expiry-date">Expiry Date</Label>
                                    <Input id="expiry-date" placeholder="MM/YY" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="cvv">CVV</Label>
                                    <Input id="cvv" placeholder="123" />
                                </div>
                            </div>
                             <Button className="w-full" onClick={() => handleSelect('card')} variant={selectedMethod === 'card' ? 'default' : 'outline'}>
                                {selectedMethod === 'card' ? 'Card Selected' : 'Use this card'}
                            </Button>
                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="upi">
                        <AccordionTrigger>
                            <div className="flex items-center gap-3">
                                <QrCode className="h-6 w-6 text-professional-blue" />
                                <span className="font-medium">UPI</span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4 pt-4">
                             <Button variant={selectedMethod === 'google-pay' ? 'outline' : 'outline'} className={`w-full justify-start gap-3 ${selectedMethod === 'google-pay' ? 'border-destructive border-2' : ''}`} onClick={() => handleSelect('google-pay')}>
                                <Wallet className="h-5 w-5" /> Google Pay
                            </Button>
                             <Button variant={selectedMethod === 'phonepe' ? 'outline' : 'outline'} className={`w-full justify-start gap-3 ${selectedMethod === 'phonepe' ? 'border-destructive border-2' : ''}`} onClick={() => handleSelect('phonepe')}>
                                <Wallet className="h-5 w-5" /> PhonePe
                            </Button>
                             <Button variant={selectedMethod === 'bhim' ? 'outline' : 'outline'} className={`w-full justify-start gap-3 ${selectedMethod === 'bhim' ? 'border-destructive border-2' : ''}`} onClick={() => handleSelect('bhim')}>
                                <Wallet className="h-5 w-5" /> BHIM
                            </Button>
                             <div className="relative">
                                <div className="absolute inset-0 flex items-center">
                                    <span className="w-full border-t" />
                                </div>
                                <div className="relative flex justify-center text-xs uppercase">
                                    <span className="bg-card px-2 text-muted-foreground">OR</span>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="upi-id">UPI ID</Label>
                                <Input id="upi-id" placeholder="yourname@bank" />
                            </div>
                            <Button className="w-full" onClick={() => handleSelect('upi')} variant={'destructive'} >
                                {selectedMethod === 'upi' ? 'UPI ID Selected' : 'Pay with UPI ID'}
                            </Button>
                        </AccordionContent>
                    </AccordionItem>
                    
                    <AccordionItem value="netbanking">
                        <AccordionTrigger>
                            <div className="flex items-center gap-3">
                                <Landmark className="h-6 w-6 text-professional-blue" />
                                <span className="font-medium">Net Banking</span>
                            </div>
                        </AccordionTrigger>
                         <AccordionContent className="space-y-4 pt-4">
                            <p className="text-sm text-muted-foreground">You will be redirected to your bank's website to complete the payment.</p>
                            <Button className="w-full" onClick={() => handleSelect('netbanking')} variant={'destructive'}>
                                {selectedMethod === 'netbanking' ? 'Net Banking Selected' : 'Proceed with Net Banking'}
                            </Button>
                        </AccordionContent>
                    </AccordionItem>

                    <AccordionItem value="wallets">
                        <AccordionTrigger>
                             <div className="flex items-center gap-3">
                                <Wallet className="h-6 w-6 text-professional-blue" />
                                <span className="font-medium">Wallets</span>
                            </div>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4 pt-4">
                            <Button variant={selectedMethod === 'paypal' ? 'outline' : 'outline'} className={`w-full justify-start gap-3 ${selectedMethod === 'paypal' ? 'border-destructive border-2' : ''}`} onClick={() => handleSelect('paypal')}>
                                <Wallet className="h-5 w-5" /> PayPal
                            </Button>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </CardContent>
        </Card>
    );
}
