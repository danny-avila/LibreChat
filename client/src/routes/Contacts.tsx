import useAuthRedirect from './useAuthRedirect';
import ContactsWorkspace from '~/components/Contacts/ContactsWorkspace';

export default function Contacts() {
    const { isAuthenticated } = useAuthRedirect();
    if (!isAuthenticated) return null;

    return <ContactsWorkspace />;
}
