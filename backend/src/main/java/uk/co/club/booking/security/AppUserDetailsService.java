package uk.co.club.booking.security;

import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import uk.co.club.booking.domain.user.UserRepository;

/** Loads the principal for authentication. */
@Service
public class AppUserDetailsService implements UserDetailsService {

    private final UserRepository userRepository;

    public AppUserDetailsService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
        return userRepository
                .findByEmail(email)
                .map(AppUserPrincipal::new)
                // Message is deliberately generic and never reaches the client: the
                // login endpoint returns one indistinguishable error for "no such user"
                // and "wrong password" so the API cannot be used to enumerate accounts.
                .orElseThrow(() -> new UsernameNotFoundException("Bad credentials"));
    }
}
