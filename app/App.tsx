import React, { useMemo } from 'react';
import { View, StyleSheet, Platform, SafeAreaView } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { colors } from './src/theme';
import { TabBar, TabKey } from './src/components';
import { MyTripsScreen } from './src/screens/MyTripsScreen';
import { TripPlannerScreen } from './src/screens/TripPlannerScreen';
import { TripFormScreen } from './src/screens/TripFormScreen';
import { AddActivityScreen } from './src/screens/AddActivityScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { ProfileScreen } from './src/screens/ProfileScreen';
import { PlaceholderScreen } from './src/screens/PlaceholderScreen';
import {
  useTripsQuery,
  useCreateTripMutation,
  useUpdateTripMutation,
  useDeleteTripMutation,
} from './src/queries/trips';
import {
  useCreateItemMutation,
  useCreateWishlistItemMutation,
  useUpdateItemMutation,
  useDeleteItemMutation,
  useReorderDayItemsMutation,
  useReorderBacklogMutation,
  useMoveItemMutation,
  useAddPackingMutation,
  useTogglePackingMutation,
  useDeletePackingMutation,
} from './src/queries/itinerary';
import { TripInput, ItineraryItemInput } from './src/api';
import { useUiStore } from './src/store/uiStore';
import { initClientObservability } from './src/observability';
import { useAuthSession } from './src/auth/useAuthSession';

const queryClient = new QueryClient();
initClientObservability();

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <AppShell />
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

function AppShell() {
  const authSession = useAuthSession();
  const {
    tab,
    tripView,
    openTripId,
    editingTripId,
    addItemDayId,
    editingItemId,
    unit,
    clock,
    setTab,
    openTrip,
    backToList,
    showAddItem,
    showEditItem,
    closeAddActivity,
    showCreateTrip,
    showEditTrip,
    closeTripForm,
    setUnit,
    setClock,
  } = useUiStore();

  const tripsQuery = useTripsQuery();
  const trips = tripsQuery.data?.data ?? [];
  const live = tripsQuery.data?.live ?? false;
  const loading = tripsQuery.isLoading;
  const isError = tripsQuery.isError;

  const createTrip = useCreateTripMutation();
  const updateTrip = useUpdateTripMutation();
  const deleteTrip = useDeleteTripMutation();
  const createItem = useCreateItemMutation();
  const createWishlistItem = useCreateWishlistItemMutation();
  const updateItem = useUpdateItemMutation();
  const deleteItem = useDeleteItemMutation();
  const reorderItems = useReorderDayItemsMutation();
  const reorderBacklog = useReorderBacklogMutation();
  const moveItem = useMoveItemMutation();
  const addPacking = useAddPackingMutation();
  const togglePacking = useTogglePackingMutation();
  const deletePacking = useDeletePackingMutation();

  const openTripData = useMemo(
    () => trips.find((t) => t.id === openTripId),
    [openTripId, trips]
  );

  const editingTripData = useMemo(
    () => trips.find((t) => t.id === editingTripId),
    [editingTripId, trips]
  );

  const editingItem = useMemo(
    () =>
      [
        ...(openTripData?.days.flatMap((d) => d.items) ?? []),
        ...(openTripData?.unscheduledItems ?? []),
      ].find((i) => i.id === editingItemId),
    [openTripData, editingItemId]
  );

  const handleSubmitTripForm = (input: TripInput) => {
    if (editingTripId) {
      updateTrip.mutate(
        { id: editingTripId, input },
        { onSuccess: () => closeTripForm() }
      );
    } else {
      createTrip.mutate(input, {
        onSuccess: (created) => openTrip(created.id),
      });
    }
  };

  const handleDeleteTrip = () => {
    if (!openTripId) return;
    deleteTrip.mutate(openTripId, { onSuccess: () => backToList() });
  };

  const handleSubmitItem = async (
    dayId: string | null,
    input: ItineraryItemInput,
    originalDayId?: string | null
  ) => {
    if (!openTripId) return;
    try {
      if (editingItemId) {
        await updateItem.mutateAsync({ tripId: openTripId, itemId: editingItemId, input });
        // Day changed (including scheduling from / unscheduling to the backlog).
        if (originalDayId !== dayId) {
          await moveItem.mutateAsync({ tripId: openTripId, itemId: editingItemId, targetDayId: dayId });
        }
      } else if (dayId == null) {
        await createWishlistItem.mutateAsync({ tripId: openTripId, input });
      } else {
        await createItem.mutateAsync({ tripId: openTripId, dayId, input });
      }
      closeAddActivity();
    } catch {
      // error surfaced via mutation state below
    }
  };

  const handleAddIdea = (title: string) => {
    if (!openTripId) return;
    createWishlistItem.mutate({
      tripId: openTripId,
      input: { type: 'Activity', status: 'Wishlist', title, currency: openTripData?.currency ?? 'EUR' },
    });
  };

  const handleDeleteItem = () => {
    if (!openTripId || !editingItemId) return;
    deleteItem.mutate(
      { tripId: openTripId, itemId: editingItemId },
      { onSuccess: () => closeAddActivity() }
    );
  };

  let content: React.ReactNode;
  if (tab === 'trips') {
    if (tripView === 'form') {
      content = (
        <TripFormScreen
          trip={editingTripData}
          saving={createTrip.isPending || updateTrip.isPending}
          serverError={
            (createTrip.error as Error | null)?.message ??
            (updateTrip.error as Error | null)?.message ??
            null
          }
          onCancel={closeTripForm}
          onSubmit={handleSubmitTripForm}
        />
      );
    } else if (tripView === 'add' && openTripData) {
      content = (
        <AddActivityScreen
          trip={openTripData}
          item={editingItem}
          saving={createItem.isPending || createWishlistItem.isPending || updateItem.isPending || moveItem.isPending}
          serverError={
            (createItem.error as Error | null)?.message ??
            (createWishlistItem.error as Error | null)?.message ??
            (updateItem.error as Error | null)?.message ??
            null
          }
          onCancel={closeAddActivity}
          onSubmit={handleSubmitItem}
          onDelete={editingItemId ? handleDeleteItem : undefined}
          clock={clock}
        />
      );
    } else if (tripView === 'detail' && openTripData) {
      content = (
        <TripPlannerScreen
          trip={openTripData}
          unit={unit}
          clock={clock}
          onBack={backToList}
          onEditTrip={() => showEditTrip(openTripData.id)}
          onDeleteTrip={handleDeleteTrip}
          deletingTrip={deleteTrip.isPending}
          onAddItem={(dayId) => showAddItem(dayId)}
          onAddIdea={handleAddIdea}
          onEditItem={(item) => showEditItem(item.id)}
          onReorder={(dayId, itemIds) => reorderItems.mutate({ tripId: openTripData.id, dayId, itemIds })}
          onReorderBacklog={(itemIds) => reorderBacklog.mutate({ tripId: openTripData.id, itemIds })}
          onAddPacking={(name) => addPacking.mutate({ tripId: openTripData.id, name })}
          onTogglePacking={(id, isPacked) => togglePacking.mutate({ tripId: openTripData.id, packingItemId: id, isPacked })}
          onDeletePacking={(id) => deletePacking.mutate({ tripId: openTripData.id, packingItemId: id })}
        />
      );
    } else {
      content = (
        <MyTripsScreen
          trips={trips}
          loading={loading}
          error={isError}
          live={live}
          onOpenTrip={openTrip}
          onCreateTrip={showCreateTrip}
        />
      );
    }
  } else if (tab === 'calendar') {
    content = <CalendarScreen trips={trips} unit={unit} clock={clock} onEditItem={(tripId, item) => { openTrip(tripId); showEditItem(item.id); }} />;
  } else if (tab === 'assistant') {
    content = (
      <PlaceholderScreen
        title="Assistant"
        emoji="✨"
        phase="Phase 5"
        blurb="An AI travel assistant that generates and refines your itinerary by editing the real trip."
      />
    );
  } else {
    content = (
      <ProfileScreen
        unit={unit}
        onChangeUnit={setUnit}
        clock={clock}
        onChangeClock={setClock}
        auth={authSession.auth}
        authLoading={authSession.loading}
        authBusy={authSession.busy}
        entraConfigured={authSession.entraConfigured}
        authError={authSession.error}
        onSignIn={authSession.signIn}
        onSignOut={authSession.signOut}
      />
    );
  }

  return (
    <View style={styles.page}>
      <View style={styles.phone}>
        <SafeAreaView style={styles.safe}>
          <StatusBar style="dark" />
          <View style={styles.screen}>{content}</View>
          <TabBar active={tab} onChange={(k: TabKey) => setTab(k)} />
        </SafeAreaView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: Platform.OS === 'web' ? '#e2e8f0' : colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  phone: Platform.select({
    web: {
      width: 400,
      height: 760,
      maxHeight: '100%',
      backgroundColor: colors.bg,
      borderRadius: 28,
      overflow: 'hidden',
      shadowColor: '#0f172a',
      shadowOpacity: 0.25,
      shadowRadius: 40,
      shadowOffset: { width: 0, height: 20 },
    },
    default: { flex: 1, alignSelf: 'stretch', backgroundColor: colors.bg },
  }) as any,
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1 },
});
