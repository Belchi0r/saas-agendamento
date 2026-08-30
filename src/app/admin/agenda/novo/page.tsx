import { listAdminServices } from "@/application/services/service-use-cases";
import { toServiceView } from "@/application/services/service-view";
import { AdminPageHeader } from "@/components/admin/admin-page-header";
import { ManualBooking } from "@/components/admin/manual-booking";
import { loadOperationalPageContext } from "@/delivery/admin/operational-page";
import { createAdminServiceContext } from "@/infrastructure/composition/service-context";

export const dynamic = "force-dynamic";

export default async function NewBookingPage() {
  const [operational, servicesContext] = await Promise.all([loadOperationalPageContext(), createAdminServiceContext()]);
  const services = (await listAdminServices(servicesContext.services)).filter((service) => service.active).map(toServiceView);
  return <main className="mx-auto min-h-screen max-w-2xl px-5 py-7 sm:px-8 sm:py-10"><AdminPageHeader businessName={operational.business.publicName} title="Novo agendamento" description="O horário segue as mesmas regras da reserva pública." active="agenda"/><ManualBooking services={services}/></main>;
}
