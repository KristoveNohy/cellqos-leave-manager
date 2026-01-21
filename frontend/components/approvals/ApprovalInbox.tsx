import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import backend from "~backend/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { Check, X } from "lucide-react";

interface ApprovalInboxProps {
  requests: any[];
  isLoading: boolean;
  onUpdate: () => void;
}

export default function ApprovalInbox({ requests, isLoading, onUpdate }: ApprovalInboxProps) {
  const { toast } = useToast();
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [comment, setComment] = useState("");
  
  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      return backend.leave_requests.approve({ id, comment });
    },
    onSuccess: () => {
      toast({ title: "Žiadosť bola schválená" });
      setComment("");
      setExpandedId(null);
      onUpdate();
    },
    onError: (error: any) => {
      console.error("Failed to approve request:", error);
      toast({
        title: "Schválenie žiadosti zlyhalo",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const rejectMutation = useMutation({
    mutationFn: async (id: number) => {
      if (!comment) {
        throw new Error("Komentár je povinný pri zamietnutí");
      }
      return backend.leave_requests.reject({ id, comment });
    },
    onSuccess: () => {
      toast({ title: "Žiadosť bola zamietnutá" });
      setComment("");
      setExpandedId(null);
      onUpdate();
    },
    onError: (error: any) => {
      console.error("Failed to reject request:", error);
      toast({
        title: "Zamietnutie žiadosti zlyhalo",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  const typeLabels = {
    ANNUAL_LEAVE: "Dovolenka",
    SICK_LEAVE: "PN",
    HOME_OFFICE: "Home office",
    UNPAID_LEAVE: "Neplatené voľno",
    OTHER: "Iné",
  };
  
  if (isLoading) {
    return <div className="text-center py-12">Načítava sa...</div>;
  }
  
  if (requests.length === 0) {
    return (
      <Card className="p-12 text-center">
        <p className="text-muted-foreground">Žiadne čakajúce žiadosti</p>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      {requests.map((request) => (
        <Card key={request.id} className="p-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 space-y-2">
                <div className="flex items-center space-x-3">
                  <h3 className="font-semibold">
                    {typeLabels[request.type as keyof typeof typeLabels]}
                  </h3>
                  <Badge className="bg-yellow-500">ČAKÁ</Badge>
                </div>
                
                <div className="text-sm text-muted-foreground">
                  {request.startDate} – {request.endDate} ({request.computedDays} dní)
                </div>
                
                {request.reason && (
                  <div className="text-sm text-muted-foreground italic">
                    Dôvod: {request.reason}
                  </div>
                )}
              </div>
              
              <div className="flex space-x-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-green-600 border-green-600 hover:bg-green-50"
                  onClick={() => setExpandedId(expandedId === request.id ? null : request.id)}
                >
                  <Check className="h-4 w-4 mr-2" />
                  Schváliť
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-red-600 border-red-600 hover:bg-red-50"
                  onClick={() => setExpandedId(expandedId === request.id ? null : request.id)}
                >
                  <X className="h-4 w-4 mr-2" />
                  Zamietnuť
                </Button>
              </div>
            </div>
            
            {expandedId === request.id && (
              <div className="space-y-3 pt-4 border-t">
                <Textarea
                  placeholder="Pridajte komentár (nepovinný pri schválení, povinný pri zamietnutí)"
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  rows={3}
                />
                <div className="flex justify-end space-x-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setExpandedId(null);
                      setComment("");
                    }}
                  >
                    Zrušiť
                  </Button>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => approveMutation.mutate(request.id)}
                    disabled={approveMutation.isPending}
                  >
                    Potvrdiť schválenie
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => rejectMutation.mutate(request.id)}
                    disabled={rejectMutation.isPending || !comment}
                  >
                    Potvrdiť zamietnutie
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
