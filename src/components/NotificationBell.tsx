import { Bell, X, AlertCircle, Info, BellRing } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useNotifications } from '@/hooks/useNotifications';
import { formatNotificationTime } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export function NotificationBell() {
  const { 
    notifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    clearAll,
    pushEnabled,
    isPushSupported,
    enablePushNotifications,
    disablePushNotifications,
  } = useNotifications();
  const { toast } = useToast();

  const handlePushToggle = async (enabled: boolean) => {
    if (enabled) {
      const success = await enablePushNotifications();
      if (success) {
        toast({
          title: 'Notificações Push Ativadas',
          description: 'Você receberá notificações mesmo quando o app estiver fechado.',
        });
      } else {
        toast({
          title: 'Erro ao Ativar Notificações',
          description: 'Não foi possível ativar as notificações push. Verifique as permissões.',
          variant: 'destructive',
        });
      }
    } else {
      const success = await disablePushNotifications();
      if (success) {
        toast({
          title: 'Notificações Push Desativadas',
          description: 'Você não receberá mais notificações push.',
        });
      }
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'reminder':
        return <Bell className="h-4 w-4" />;
      case 'alert':
        return <AlertCircle className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  const getIconColor = (type: string) => {
    switch (type) {
      case 'reminder':
        return 'text-primary';
      case 'alert':
        return 'text-warning';
      default:
        return 'text-muted-foreground';
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button 
          variant="ghost" 
          size="icon" 
          className="relative hover:bg-accent hover:text-accent-foreground hover:shadow-md hover:scale-105 transition-all duration-200 rounded-xl"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge 
              className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0 text-xs"
              variant="destructive"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="font-semibold">Notificações</h3>
          {notifications.length > 0 && (
            <div className="flex gap-2">
              {unreadCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={markAllAsRead}
                  className="h-8 text-xs hover:bg-accent hover:text-accent-foreground hover:shadow-sm transition-all duration-200"
                >
                  Marcar todas como lidas
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={clearAll}
                className="h-8 w-8 hover:bg-accent hover:text-accent-foreground hover:shadow-sm transition-all duration-200 rounded-lg"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Push Notifications Toggle */}
        {isPushSupported && (
          <div className="flex items-center justify-between p-4 border-b bg-muted/30">
            <div className="flex items-center gap-2">
              <BellRing className="h-4 w-4 text-primary" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Push Notifications</span>
                <span className="text-xs text-muted-foreground">
                  Receba alertas mesmo offline
                </span>
              </div>
            </div>
            <Switch
              checked={pushEnabled}
              onCheckedChange={handlePushToggle}
            />
          </div>
        )}

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <Bell className="h-12 w-12 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              Nenhuma notificação
            </p>
          </div>
        ) : (
          <ScrollArea className="h-[400px]">
            <div className="divide-y">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    'p-4 hover:bg-accent/50 hover:shadow-sm transition-all duration-200 cursor-pointer rounded-lg mx-2 my-1',
                    !notification.read && 'bg-muted/30'
                  )}
                  onClick={() => markAsRead(notification.id)}
                >
                  <div className="flex gap-3">
                    <div className={cn('mt-1', getIconColor(notification.type))}>
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-medium text-sm">
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <div className="h-2 w-2 rounded-full bg-primary mt-1" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {notification.message}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatNotificationTime(notification.date)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </PopoverContent>
    </Popover>
  );
}
